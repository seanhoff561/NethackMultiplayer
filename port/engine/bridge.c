/* NetHack 5.0 first-person port: native JSON window bridge.
 * Modified 2026-09-07 for NetHack: Descent.
 * This file is part of the NetHack port and is distributed under dat/license.
 * Game rules, dungeon creation and commands remain in the upstream core.
 */
#include "hack.h"
#include "func_tab.h"
#include "dlb.h"
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
__declspec(dllimport) void __stdcall Sleep(unsigned long);

typedef void (*shim_cb)(const char *, void *, const char *, ...);
extern void shim_graphics_set_callback(shim_cb);
extern int nh_native_main(int, char **);
extern boolean portable;
extern char portable_device_path[];

#define MAX_WINDOWS 64
#define MAX_ITEMS 2048
#define MAX_MESSAGES 40
typedef struct BridgeItem { anything value; char key; unsigned flags; char text[BUFSZ * 2]; } BridgeItem;
typedef struct BridgeWindow { int type, count; BridgeItem *items; char prompt[BUFSZ]; char text[16384]; } BridgeWindow;
static BridgeWindow bw[MAX_WINDOWS];
static glyph_info drawn[COLNO][ROWNO];
static unsigned char painted[COLNO][ROWNO];
static char message_log[MAX_MESSAGES][BUFSZ * 2];
static unsigned long message_ids[MAX_MESSAGES], next_message = 1;
static int message_count = 0, next_window = 1, snapshot_guard = 0;
static char wire_line[16384];
static int turn_ms = 800;
static unsigned long action_serial = 0;
static unsigned long spatial_serial = 0;
static void json_string(const char *s);
void descent_player_effect(const char *kind) {
    fputs("{\"type\":\"player-effect\",\"kind\":",stdout);
    json_string(kind);fputs("}\n",stdout);fflush(stdout);
}
void descent_item_picked_up(struct obj *obj) {
    fputs("{\"type\":\"item-picked-up\",\"name\":",stdout);
    json_string(doname(obj));fputs("}\n",stdout);fflush(stdout);
}

void descent_monster_defeated(unsigned id) {
    printf("{\"type\":\"actor-defeated\",\"actorId\":%u}\n",id);fflush(stdout);
}
static double player_x = 0, player_z = 0, player_height = 0;
typedef struct SpatialActor { unsigned id; double x,z,y; int gx,gz,can_hit; } SpatialActor;
static SpatialActor spatial_actors[4096];
static SpatialActor *actor_position(struct monst *mon) {
    SpatialActor *p = &spatial_actors[mon->m_id % 4096];
    if (p->id != mon->m_id) { p->id=mon->m_id; p->x=(mon->mx+.5)*3; p->z=(mon->my+.5)*3; p->y=0;p->gx=0;p->gz=0;p->can_hit=1; }
    return p;
}
void descent_set_goal(struct monst *mon,int x,int z) { SpatialActor *p=actor_position(mon);p->gx=x;p->gz=z; }
int descent_actors_in_reach(struct monst *one,struct monst *two) {
    SpatialActor *a=actor_position(one),*b=actor_position(two);
    double dx=a->x-b->x,dz=a->z-b->z,dy=a->y-b->y;
    return dx*dx+dz*dz<3.4225&&dy*dy<2.25;
}
/* The C rules resolve damage, while reach is measured in metres. */
int descent_in_reach(struct monst *mon) {
    SpatialActor *p=actor_position(mon);
    double dx=p->x-player_x,dz=p->z-player_z,dy=p->y-player_height;
    if(!spatial_serial)return 1;
    return p->can_hit && dx*dx+dz*dz<3.4225 && dy*dy<2.25;
}

static void json_string(const char *s) {
    const unsigned char *p = (const unsigned char *)(s ? s : "");
    putchar('"');
    for (; *p; p++) {
        if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
        else if (*p == '\n') fputs("\\n", stdout);
        else if (*p == '\r') fputs("\\r", stdout);
        else if (*p == '\t') fputs("\\t", stdout);
        else if (*p < 32 || *p >= 128) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}
static void json_char(int ch) { char s[2] = {(char)ch, 0}; json_string(s); }
static void add_message(const char *s) {
    if (!s || !*s) return;
    if (message_count == MAX_MESSAGES) {
        memmove(message_log, message_log + 1, sizeof(message_log[0]) * (MAX_MESSAGES - 1));
        memmove(message_ids, message_ids + 1, sizeof(message_ids[0]) * (MAX_MESSAGES - 1));
        message_count--;
    }
    strncpy(message_log[message_count], s, sizeof(message_log[0]) - 1);
    message_log[message_count][sizeof(message_log[0]) - 1] = 0;
    message_ids[message_count++] = next_message++;
}
static const char *terrain(int x, int y) {
    int typ = levl[x][y].typ;
    int g = painted[x][y] ? drawn[x][y].glyph : levl[x][y].glyph;
    int cm = glyph_to_cmap(g);
    if (typ == STONE || typ == SCORR) return "stone";
    if (IS_WALL(typ) || typ == SDOOR) return "wall";
    if (typ == TREE) return "tree";
    if (typ == IRONBARS) return "bars";
    if (typ == DOOR) {
        return (levl[x][y].doormask & (D_CLOSED | D_LOCKED)) ? "door-closed" : "door-open";
    }
    if (typ == CORR) return "corridor";
    if (typ == STAIRS || typ == LADDER) {
        stairway *st;
        for (st = gs.stairs; st; st = st->next) if (st->sx == x && st->sy == y) return st->up ? "stairs-up" : "stairs-down";
        return "stairs-down";
    }
    if (IS_POOL(typ)) return "water";
    if (IS_LAVA(typ)) return "lava";
    if (typ == FOUNTAIN) return "fountain";
    if (typ == SINK) return "sink";
    if (typ == ALTAR) return "altar";
    if (typ == THRONE) return "throne";
    if (typ == GRAVE) return "grave";
    if (typ == ICE) return "ice";
    if (typ == AIR || typ == CLOUD) return "air";
    return "floor";
}
static void snapshot(void) {
    int x, y, first = 1, i;
    struct obj *obj;
    const char *hunger_names[] = {"Satiated", "", "Hungry", "Weak", "Fainting", "Fainted", "Starved"};
    if (snapshot_guard || !u.ux || !u.ulevel) return;
    snapshot_guard = 1;
    printf("{\"type\":\"snapshot\",\"width\":%d,\"height\":%d,\"turn\":%ld,\"levelId\":\"%d:%d\",\"player\":{\"x\":%d,\"y\":%d,\"hp\":%d,\"maxHp\":%d,\"power\":%d,\"maxPower\":%d,\"ac\":%d,\"level\":%d,\"depth\":%d,\"gold\":%ld,\"hunger\":%d,\"name\":", COLNO, ROWNO, svm.moves, u.uz.dnum, u.uz.dlevel, u.ux, u.uy, Upolyd ? u.mh : u.uhp, Upolyd ? u.mhmax : u.uhpmax, u.uen, u.uenmax, u.uac, u.ulevel, depth(&u.uz), money_cnt(gi.invent), u.uhunger);
    json_string(svp.plname); fputs(",\"role\":", stdout); json_string(gu.urole.name.m);
    fputs(",\"race\":", stdout); json_string(gu.urace.noun);
    fputs(",\"dungeon\":", stdout); json_string(svd.dungeons[u.uz.dnum].dname);
    printf(",\"strength\":%d,\"dexterity\":%d,\"constitution\":%d,\"intelligence\":%d,\"wisdom\":%d,\"charisma\":%d,\"blind\":%s,\"confused\":%s,\"stunned\":%s,\"hallucinating\":%s,\"levitating\":%s,\"conditions\":[", ACURR(A_STR), ACURR(A_DEX), ACURR(A_CON), ACURR(A_INT), ACURR(A_WIS), ACURR(A_CHA), Blind ? "true":"false", Confusion ? "true":"false", Stunned ? "true":"false", Hallucination ? "true":"false", Levitation ? "true":"false");
    first = 1;
#define CONDITION(test, value) if (test) { if (!first) putchar(','); json_string(value); first = 0; }
    CONDITION(u.uhs < 7 && *hunger_names[u.uhs], hunger_names[u.uhs]);
    CONDITION(Blind, "Blind"); CONDITION(Confusion, "Confused"); CONDITION(Stunned, "Stunned");
    CONDITION(Hallucination, "Hallucinating"); CONDITION(Levitation, "Levitating");
    CONDITION(Slimed, "Slimed"); CONDITION(Stoned, "Petrifying"); CONDITION(Strangled, "Strangled");
    CONDITION(Sick, "Sick"); CONDITION(u.utrap, "Trapped"); CONDITION(u.uswallow, "Swallowed");
    fputs("],\"weapon\":", stdout); json_string(uwep ? doname(uwep) : "bare hands");
    fputs(",\"shield\":", stdout); json_string(uarms ? doname(uarms) : "");
    printf(",\"immobile\":%s,\"speedScale\":%.2f},\"spatialSerial\":%lu,\"actionSerial\":%lu,\"tiles\":[", (u.utrap || u.uswallow || gm.multi<0 || go.occupation) ? "true":"false", Very_fast ? 1.5 : Fast ? 1.25 : 1.0, spatial_serial, action_serial); first = 1;
    for (y = 0; y < ROWNO; y++) for (x = 1; x < COLNO; x++) {
        glyph_info info;
        const char *type;
        int g, cm;
        info = drawn[x][y];
        if (!painted[x][y]) map_glyphinfo(x, y, levl[x][y].glyph, 0, &info);
        g = info.glyph; cm = glyph_to_cmap(g); type = terrain(x,y);
        if (!first) putchar(','); first = 0;
        printf("{\"x\":%d,\"y\":%d,\"type\":", x, y); json_string(type);
        printf(",\"seen\":%s,\"explored\":%s",levl[x][y].seenv?"true":"false",levl[x][y].seenv?"true":"false");
        printf(",\"glyph\":%d,\"char\":", g); json_char(info.ttychar);
        printf(",\"color\":%d,\"visible\":%s,\"lit\":%s,\"description\":", info.gm.sym.color, cansee(x,y) ? "true":"false", levl[x][y].lit ? "true":"false"); json_string(type);
        if (glyph_is_monster(g) && !(x == u.ux && y == u.uy)) {
            int mn = glyph_to_mon(g);
            struct monst *mon = m_at(x,y);
            printf(",\"monster\":{\"id\":%u,\"index\":%d,\"name\":", mon && canseemon(mon) ? mon->m_id : (unsigned)(x + y * COLNO), mn);
            json_string(mn < NUMMONS ? mons[mn].pmnames[NEUTRAL] : "creature");
            printf(",\"symbol\":"); json_char(mn < NUMMONS ? def_monsyms[(int)mons[mn].mlet].sym : '?');
            printf(",\"color\":%d,\"size\":%d,\"tame\":%s,\"peaceful\":%s,\"visible\":%s}", mn < NUMMONS ? mons[mn].mcolor : 7, mn < NUMMONS ? mons[mn].msize : 2, glyph_is_pet(g) ? "true":"false", mon && canseemon(mon) && mon->mpeaceful ? "true":"false", mon && canseemon(mon) ? "true":"false");
        } else if (svl.level.objects[x][y]) {
            int oi = svl.level.objects[x][y]->otyp;
            fputs(",\"object\":{\"index\":", stdout); printf("%d,\"name\":", oi); json_string(simple_typename(oi));
            printf(",\"class\":%d,\"symbol\":", objects[oi].oc_class); json_char(def_oc_syms[(int)objects[oi].oc_class].sym); putchar('}');
        }
        if (glyph_is_trap(g)) { fputs(",\"trap\":true", stdout); }
        putchar('}');
    }
    fputs("],\"actors\":[", stdout); first = 1;
    {
        struct monst *mon;
        for(mon=fmon;mon;mon=mon->nmon) {
            int mn;
            if(DEADMONSTER(mon)||!isok(mon->mx,mon->my))continue;
            mn=monsndx(mon->data);
            if(!first)putchar(',');first=0;
            printf("{\"id\":%u,\"x\":%d,\"y\":%d,\"index\":%d,\"name\":",mon->m_id,mon->mx,mon->my,mn);
            json_string(mon->data->pmnames[NEUTRAL]);fputs(",\"symbol\":",stdout);json_char(def_monsyms[(int)mon->data->mlet].sym);
            { SpatialActor *p=actor_position(mon);printf(",\"goalX\":%d,\"goalZ\":%d",p->gx,p->gz); }
            printf(",\"hp\":%d,\"maxHp\":%d",mon->mhp,mon->mhpmax);
            printf(",\"color\":%d,\"size\":%d,\"speed\":%d,\"tame\":%s,\"peaceful\":%s,\"canMove\":%s,\"sleeping\":%s,\"fleeing\":%s,\"stationary\":%s,\"visible\":%s}",mon->data->mcolor,mon->data->msize,mon->data->mmove,mon->mtame?"true":"false",mon->mpeaceful?"true":"false",mon->mcanmove&&!mon->mtrapped&&!mon->meating?"true":"false",mon->msleeping?"true":"false",mon->mflee?"true":"false",mon->isshk||mon->ispriest||mon->isgd?"true":"false",!mon->mundetected&&mon->m_ap_type==M_AP_NOTHING&&(!mon->minvis||See_invisible)?"true":"false");
        }
    }
    fputs("],\"floorObjects\":[",stdout);first=1;
    for(obj=fobj;obj;obj=obj->nobj) {
        if(obj->where!=OBJ_FLOOR)continue;
        if(!first)putchar(',');first=0;
        printf("{\"id\":%u,\"x\":%d,\"y\":%d,\"quantity\":%ld,\"class\":%d,\"name\":",obj->o_id,obj->ox,obj->oy,obj->quan,obj->oclass);
        json_string(distant_name(obj,doname));fputs(",\"symbol\":",stdout);json_char(def_oc_syms[(int)obj->oclass].sym);putchar('}');
    }
    fputs("],\"inventory\":[", stdout); first = 1;
    for (obj = gi.invent; obj; obj = obj->nobj) {
        if (!first) putchar(','); first = 0;
        printf("{\"id\":%u,\"key\":", obj->o_id); json_char(obj->invlet);
        fputs(",\"name\":", stdout); json_string(doname(obj));
        printf(",\"class\":%d,\"quantity\":%ld,\"weight\":%u,\"equipped\":%s,\"glyph\":%d,\"symbol\":", obj->oclass, obj->quan, obj->owt, obj->owornmask ? "true":"false", obj_to_glyph(obj, rn2_on_display_rng)); json_char(def_oc_syms[(int)obj->oclass].sym);
        fputs("}", stdout);
    }
    fputs("],\"messages\":[", stdout);
    for (i = 0; i < message_count; i++) { if (i) putchar(','); printf("{\"id\":%lu,\"text\":", message_ids[i]); json_string(message_log[i]); putchar('}'); }
    fputs("]}\n", stdout); fflush(stdout); snapshot_guard = 0;
}
static char *read_wire(void) {
    for (;;) {
        if (!fgets(wire_line, sizeof(wire_line), stdin)) exit(0);
        wire_line[strcspn(wire_line, "\r\n")] = 0;
        if (wire_line[0] == 'p' && wire_line[1] == ' ') {
            turn_ms = atoi(wire_line + 2);
            if (turn_ms < 250) turn_ms = 250; if (turn_ms > 3000) turn_ms = 3000;
            continue;
        }
        if(wire_line[0]=='v' && wire_line[1]==' ') {
            unsigned long serial; int dnum,dlevel,ax=0,az=0,count; double px,pz,py;
            count=sscanf(wire_line+2,"%lu %d %d %lf %lf %lf %d %d",&serial,&dnum,&dlevel,&px,&pz,&py,&ax,&az);
            if(count>=6 && dnum==u.uz.dnum && dlevel==u.uz.dlevel) {
                int x=count==8?ax:(int)(px/3),y=count==8?az:(int)(pz/3);
                spatial_serial=serial;
                if(isok(x,y)&&!IS_OBSTRUCTED(levl[x][y].typ)&&!(levl[x][y].typ==DOOR&&(levl[x][y].doormask&(D_CLOSED|D_LOCKED)))&&!u.utrap&&!u.uswallow&&gm.multi>=0&&!go.occupation) {
                    /* Bodies may share an authored cell. Keep the legacy
                       occupancy map valid without relocating the 3D body. */
                    struct monst *occupant=m_at(x,y);
                    if(occupant&&occupant!=u.usteed) {
                        coord cc;
                        if(!enexto(&cc,x,y,occupant->data))continue;
                        (void)actor_position(occupant);
                        remove_monster(x,y);place_monster(occupant,cc.x,cc.y);newsym(cc.x,cc.y);
                    }
                    player_x=px;player_z=pz;player_height=py;
                    if(x!=u.ux||y!=u.uy) {
                        u.ux0=u.ux;u.uy0=u.uy;u_on_newpos(x,y);vision_recalc(0);spoteffects(TRUE);newsym(u.ux0,u.uy0);newsym(u.ux,u.uy);
                        snapshot();
                    }
                }
            }
            continue;
        }
        if(wire_line[0]=='n' && wire_line[1]==' ') {
            unsigned id;double px,pz,py;int can_hit=1;struct monst *mon;
            if(sscanf(wire_line+2,"%u %lf %lf %lf %d",&id,&px,&pz,&py,&can_hit)>=4)for(mon=fmon;mon;mon=mon->nmon)if(mon->m_id==id&&!DEADMONSTER(mon)) {
                int x=(int)(px/3),y=(int)(pz/3);SpatialActor *p=actor_position(mon);
                p->x=px;p->z=pz;p->y=py;p->can_hit=can_hit;
                if(isok(x,y)&&!IS_OBSTRUCTED(levl[x][y].typ)&&(!m_at(x,y)||m_at(x,y)==mon)&&(x!=u.ux||y!=u.uy)&&(x!=mon->mx||y!=mon->my)&&mon->mcanmove&&!mon->msleeping) {
                    int ox=mon->mx,oy=mon->my;
                    if(m_in_out_region(mon,x,y)) {
                        remove_monster(ox,oy);place_monster(mon,x,y);newsym(ox,oy);newsym(x,y);set_apparxy(mon);
                        (void)mintrap(mon,NO_TRAP_FLAGS);
                    }
                }
                break;
            }
            continue;
        }
        break;
    }
    return strlen(wire_line) >= 2 ? wire_line + 2 : wire_line + strlen(wire_line);
}
static void request(const char *kind, const char *prompt) {
    snapshot(); fputs("{\"type\":\"request\",\"kind\":", stdout); json_string(kind);
    fputs(",\"prompt\":", stdout); json_string(prompt);
}
static void finish_request(void) { fputs("}\n", stdout); fflush(stdout); }
static int input_key(const char *kind, const char *prompt) {
    char *p;
    /* Descent must keep time advancing even beside hostile creatures. */
    if(!strcmp(kind,"command"))flags.safe_wait=FALSE;
    request(kind, prompt); finish_request(); p = read_wire();
    if(wire_line[0]=='g'&&!strcmp(kind,"command")) {
        unsigned id=(unsigned)strtoul(p,NULL,10);struct obj *obj;
        struct trap *trap=t_at(u.ux,u.uy);
        if(u.uswallow||notake(gy.youmonst.data)||!can_reach_floor(trap&&is_pit(trap->ttyp))) {
            You("cannot reach that item.");return '.';
        }
        gp.pickup_encumbrance=0;
        for(obj=fobj;obj;obj=obj->nobj)if(obj->o_id==id&&obj->where==OBJ_FLOOR&&distmin(u.ux,u.uy,obj->ox,obj->oy)<=1){
            (void)pickup_object(obj,obj->quan,FALSE);break;
        }
        return '.';
    }
    if(wire_line[0]=='a'&&!strcmp(kind,"command")) {
        unsigned id=(unsigned)strtoul(p,NULL,10);struct monst *mon;
        for(mon=fmon;mon;mon=mon->nmon)if(mon->m_id==id&&!DEADMONSTER(mon)&&descent_in_reach(mon)) {
            u.dx=sgn(mon->mx-u.ux);u.dy=sgn(mon->my-u.uy);
            force_attack(mon,TRUE);break;
        }
        return '.';
    }
    return wire_line[0] == 'k' ? atoi(p) : (*p ? (unsigned char)*p : 27);
}
static void metadata(void) {
    int i, first = 1;
    fputs("{\"type\":\"commands\",\"commands\":[", stdout);
    for (i = 0; extcmdlist[i].ef_txt; i++) {
        const struct ext_func_tab *cmd = &extcmdlist[i];
        if (cmd->flags & (WIZMODECMD | INTERNALCMD | CMD_NOT_AVAILABLE)) continue;
        if (!first) putchar(','); first = 0;
        fputs("{\"name\":", stdout); json_string(cmd->ef_txt); fputs(",\"description\":", stdout); json_string(cmd->ef_desc);
        printf(",\"key\":%d,\"general\":%s}", cmd->key, cmd->flags & GENERALCMD ? "true":"false");
    }
    fputs("]}\n", stdout); fflush(stdout);
}
static void bridge_callback(const char *name, void *ret, const char *fmt, ...) {
    va_list ap; int w, i, how; const char *s; BridgeWindow *window;
    va_start(ap, fmt);
    if (!strcmp(name, "shim_init_nhwindows")) { iflags.window_inited = TRUE; metadata(); }
    else if (!strcmp(name, "shim_player_selection")) {
        if (flags.initrole < 0) flags.initrole = str2role("Valkyrie");
        if (flags.initrace < 0) flags.initrace = randrace(flags.initrole);
        if (flags.initgend < 0) flags.initgend = randgend(flags.initrole, flags.initrace);
        if (flags.initalign < 0) flags.initalign = randalign(flags.initrole, flags.initrace);
    }
    else if (!strcmp(name, "shim_askname")) { strcpy(svp.plname, "Delver"); }
    else if (!strcmp(name, "shim_create_nhwindow")) {
        int type = va_arg(ap,int); w = next_window++;
        if (w >= MAX_WINDOWS) { for(w=1; w<MAX_WINDOWS; w++) if(!bw[w].type) break; }
        if (w >= MAX_WINDOWS) w = MAX_WINDOWS - 1;
        memset(&bw[w], 0, sizeof(bw[w])); bw[w].type = type; *(int *)ret = w;
    }
    else if (!strcmp(name, "shim_destroy_nhwindow")) {
        w = va_arg(ap,int); if (w>0 && w<MAX_WINDOWS) { free(bw[w].items); memset(&bw[w],0,sizeof(bw[w])); }
    }
    else if (!strcmp(name, "shim_clear_nhwindow")) {
        w = va_arg(ap,int); if (w>0 && w<MAX_WINDOWS) { bw[w].text[0] = 0; if(bw[w].type == NHW_MAP) memset(painted,0,sizeof(painted)); }
    }
    else if (!strcmp(name, "shim_print_glyph")) {
        int x,y; const glyph_info *g; w=va_arg(ap,int); x=va_arg(ap,int); y=va_arg(ap,int); g=va_arg(ap,const glyph_info *);
        if(x>0 && x<COLNO && y>=0 && y<ROWNO && g) { drawn[x][y]=*g; painted[x][y]=1; }
    }
    else if (!strcmp(name, "shim_putstr")) {
        w=va_arg(ap,int); i=va_arg(ap,int); s=va_arg(ap,const char *);
        if(w>0 && w<MAX_WINDOWS && (bw[w].type == NHW_TEXT || bw[w].type == NHW_MENU)) {
            size_t used = strlen(bw[w].text); if (used + strlen(s) + 2 < sizeof(bw[w].text)) { strcat(bw[w].text,s); strcat(bw[w].text,"\n"); }
        } else if(w<=0 || w>=MAX_WINDOWS || bw[w].type == NHW_MESSAGE) add_message(s);
    }
    else if (!strcmp(name, "shim_raw_print") || !strcmp(name, "shim_raw_print_bold")) {
        s=va_arg(ap,const char *); add_message(s); fputs("{\"type\":\"message\",\"text\":",stdout); json_string(s); fputs("}\n",stdout); fflush(stdout);
    }
    else if (!strcmp(name, "shim_nh_poskey")) { *(int *)ret=input_key("command", ""); }
    else if (!strcmp(name, "shim_get_nh_event")) {
        if (svc.context.move) action_serial++;
        /* Occupations and helplessness bypass nh_poskey; pace those real turns. */
        if (go.occupation || gm.multi != 0) {
            snapshot(); Sleep((unsigned long)turn_ms);
        }
    }
    else if (!strcmp(name, "shim_nhgetch")) { *(int *)ret=input_key("key", message_count ? message_log[message_count-1] : ""); }
    else if (!strcmp(name, "shim_yn_function")) {
        const char *choices; int def; char *p;
        s=va_arg(ap,const char *); choices=va_arg(ap,const char *); def=va_arg(ap,int);
        request("yn",s); fputs(",\"choices\":",stdout); json_string(choices); printf(",\"default\":%d",def); finish_request(); p=read_wire();
        *(char *)ret = (char)(wire_line[0]=='k' ? atoi(p) : *p ? *p : 27);
    }
    else if (!strcmp(name, "shim_getlin")) {
        char *buf,*p; s=va_arg(ap,const char *); buf=va_arg(ap,char *);
        request("text",s); finish_request(); p=read_wire();
        if(wire_line[0]=='k' && atoi(p)==27) { buf[0]=27; buf[1]=0; }
        else { strncpy(buf,p,BUFSZ-1); buf[BUFSZ-1]=0; }
    }
    else if (!strcmp(name, "shim_get_ext_cmd")) {
        char *p; request("extcmd","Extended command"); finish_request(); p=read_wire(); *(int *)ret=-1;
        for(i=0;extcmdlist[i].ef_txt;i++) if(!strcmp(extcmdlist[i].ef_txt,p)) { *(int *)ret=i; break; }
    }
    else if (!strcmp(name, "shim_start_menu")) {
        w=va_arg(ap,int); if(w>0 && w<MAX_WINDOWS) { window=&bw[w]; if(!window->items) window->items=calloc(MAX_ITEMS,sizeof(BridgeItem)); window->count=0; window->text[0]=0; window->prompt[0]=0; }
    }
    else if (!strcmp(name, "shim_add_menu")) {
        const glyph_info *g; const anything *id; int key,group,attr,color; unsigned itemflags;
        w=va_arg(ap,int); g=va_arg(ap,const glyph_info *); id=va_arg(ap,const anything *); key=va_arg(ap,int); group=va_arg(ap,int); attr=va_arg(ap,int); color=va_arg(ap,int); s=va_arg(ap,const char *); itemflags=va_arg(ap,unsigned);
        if(w>0 && w<MAX_WINDOWS && bw[w].items && bw[w].count<MAX_ITEMS) {
            BridgeItem *it=&bw[w].items[bw[w].count++]; memset(it,0,sizeof(*it)); if(id) it->value=*id; it->key=(char)key; it->flags=itemflags; strncpy(it->text,s,sizeof(it->text)-1);
        }
    }
    else if (!strcmp(name, "shim_end_menu")) { w=va_arg(ap,int); s=va_arg(ap,const char *); if(w>0 && w<MAX_WINDOWS) { strncpy(bw[w].prompt,s?s:"",BUFSZ-1); } }
    else if (!strcmp(name, "shim_select_menu")) {
        menu_item **out; char *p; int selected=0; w=va_arg(ap,int); how=va_arg(ap,int); out=va_arg(ap,menu_item **); *out=NULL;
        window=&bw[w]; request("menu",window->prompt); printf(",\"how\":%d,\"items\":[",how);
        for(i=0;i<window->count;i++) { if(i) putchar(','); printf("{\"id\":%d,\"key\":",i+1); json_char(window->items[i].key); fputs(",\"text\":",stdout); json_string(window->items[i].text); printf(",\"selectable\":%s}",window->items[i].value.a_void ? "true":"false"); }
        putchar(']'); finish_request(); p=read_wire();
        if(wire_line[0]=='m' && *p) {
            *out=calloc(window->count?window->count:1,sizeof(menu_item));
            while(*p && selected<window->count) { int id=atoi(p); if(id>0 && id<=window->count && window->items[id-1].value.a_void) { (*out)[selected].item=window->items[id-1].value; (*out)[selected].count=-1; (*out)[selected].itemflags=window->items[id-1].flags; selected++; if(how==PICK_ONE) break; } p=strchr(p,','); if(!p) break; p++; }
        } else if(wire_line[0]=='k' && atoi(p)!=27) {
            int key=atoi(p); for(i=0;i<window->count;i++) if(window->items[i].key==key && window->items[i].value.a_void) { *out=calloc(1,sizeof(menu_item)); (*out)[0].item=window->items[i].value; (*out)[0].count=-1; selected=1; break; }
        }
        if(!selected) { free(*out); *out=NULL; }
        *(int *)ret=selected ? selected : -1;
    }
    else if (!strcmp(name, "shim_display_nhwindow")) {
        int blocking; w=va_arg(ap,int); blocking=va_arg(ap,int);
        if(w>0 && w<MAX_WINDOWS && bw[w].text[0]) {
            /* Ground piles are presented as individual 3D objects, not a modal. */
            if(bw[w].type==NHW_MENU&&(strstr(bw[w].text,"that are here:")||strstr(bw[w].text,"that you feel here:"))) { }
            else {request("display",bw[w].text);finish_request();read_wire();}
        }
    }
    else if (!strcmp(name, "shim_display_file")) {
        dlb *f; char line[BUFSZ]; s=va_arg(ap,const char *); f=dlb_fopen(s,"r");
        if(f) { fputs("{\"type\":\"document\",\"title\":",stdout); json_string(s); fputs(",\"lines\":[",stdout); i=0; while(dlb_fgets(line,sizeof(line),f)) { if(i++) putchar(','); json_string(line); } fputs("]}\n",stdout); fflush(stdout); dlb_fclose(f); }
    }
    else if (!strcmp(name, "shim_exit_nhwindows")) { s=va_arg(ap,const char *); snapshot(); fputs("{\"type\":\"ended\",\"reason\":",stdout); json_string(s); fputs("}\n",stdout); fflush(stdout); }
    va_end(ap);
}
int main(int argc, char **argv) {
    char cwd[1024];
    const char *pace = getenv("NH_TURN_MS");
    if (pace) { turn_ms = atoi(pace); if (turn_ms < 250) turn_ms = 250; if (turn_ms > 3000) turn_ms = 3000; }
    setvbuf(stdout,NULL,_IOFBF,65536);
    portable=TRUE;
    if(getcwd(cwd,sizeof(cwd))) { strcpy(portable_device_path,cwd); strcat(portable_device_path,"\\"); }
    shim_graphics_set_callback(bridge_callback);
    return nh_native_main(argc,argv);
}

