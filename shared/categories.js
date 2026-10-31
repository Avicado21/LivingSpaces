/* The ten things a livingSpaces room can hold. Shared by the browser (labels,
   picker, layout) and the server (Claude Haiku's allowed list and definitions). */
export const CATEGORIES = [
  { id: 'couch', label: 'Couch', long: 'Couch', definition: 'seating for two or more people side by side. Sofas, sectionals, loveseats, futons, sofa beds.' },
  { id: 'chair', label: 'Chair', long: 'Chair', definition: 'seating for ONE person. Armchairs, accent and lounge chairs, recliners, club chairs, desk and office chairs, dining chairs, stools, rocking chairs, bean bags. An armchair is a chair, never a couch, even when it is upholstered, chunky, or matches a sofa.' },
  { id: 'coffee_table', label: 'Coffee table', long: 'Coffee table', definition: 'a low living-room table. Coffee tables, side tables, end tables, nesting tables, and low benches or trunks used as a table (for example holding books, a vase or a plant).' },
  { id: 'tv', label: 'TV', long: 'TV', definition: 'a television or large display, with or without its stand or TV console.' },
  { id: 'speaker', label: 'Speaker', long: 'Speakers / sound system', definition: 'TV speakers and sound systems. Soundbars, bookshelf or tower speakers, subwoofers, smart speakers, stereo and AV receivers.' },
  { id: 'rug', label: 'Rug', long: 'Area rug', definition: 'a rug lying flat on the floor. Area rugs, runners, carpets, floor mats.' },
  { id: 'lamp', label: 'Lamp', long: 'Floor lamp', definition: 'a lamp. Floor lamps, standing and arc lamps, torchieres, table and desk lamps.' },
  { id: 'bookshelf', label: 'Bookshelf', long: 'Bookshelf', definition: 'open storage shelving. Bookcases, cube organizers, shelving units, étagères, wall shelves holding books or decor.' },
  { id: 'game_console', label: 'Console', long: 'Game console', definition: 'video game hardware. PlayStation, Xbox, Nintendo Switch, handheld gaming PCs, VR headsets, and game controllers on their own.' },
  { id: 'mini_fridge', label: 'Mini fridge', long: 'Mini fridge', definition: 'a small refrigerator. Mini fridges, compact fridges, beverage coolers.' },
];
export const CATEGORY_IDS = CATEGORIES.map(c => c.id);
export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
export const isCategory = id => Object.hasOwn(CAT, id);
export const catLong = id => CAT[id]?.long || CAT[id]?.label || id;
/* lower-case word for sentences ("Looks like a coffee table"), keeping TV upper-case */
export const catWord = id => (id === 'tv' ? 'TV' : catLong(id).toLowerCase());
