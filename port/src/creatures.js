// Shared silhouettes/collision sizes. Small wildlife stays small; humanoids
// meet the player's eye line and major threats nearly fill a three metre hall.
export function creatureProfile(data={}){
  const name=(data.name||'').toLowerCase(),symbol=data.symbol||'';
  const boss=!!data.boss||/demogorgon|orcus|asmodeus|baalzebub|juiblex|yeenoghu|wizard of yendor|vlad|medusa|master kaen|dark one|cyclops|minion of huhetotl|chromatic dragon/.test(name);
  const huge=boss||/dragon|giant|titan|minotaur|balrog|ettin|purple worm/.test(name)||data.size>=4;
  const large=huge||/ogre|troll|centaur|golem|bear|horse|unicorn/.test(name)||data.size===3;
  const small=/gnome|dwarf|goblin|kobold|hobbit|imp|leprechaun/.test(name);
  const wildlife=/kitten|little dog|rat|mouse|newt|lizard|bat|bee|ant|lichen|mold/.test(name)&&!huge;
  return {boss,huge,large,small,wildlife,height:boss?3.3:huge?3.05:large?2.55:small?1.6:wildlife?.55:1.95,
    radius:boss?1.08:huge?.94:large?.64:wildlife?.2:small?.33:.42,
    style:/lich|wizard|mage|sorcerer|priest/.test(name)?'caster':/demon|devil|balrog|imp/.test(name)||symbol==='&'?'demon':/gnome|dwarf/.test(name)?'miner':/soldier|guard|captain|sergeant|knight/.test(name)?'soldier':/orc|goblin/.test(name)?'orc':/zombie|mummy|wraith|ghost|vampire/.test(name)?'undead':'ordinary'};
}
