/* =============================================================
   Technic Games — game data
   -------------------------------------------------------------
   THIS IS THE ONLY FILE YOU NEED TO EDIT TO:
     • add a new game            -> append an object to the array
     • launch a game             -> paste the store URL into `ios` / `android`

   Store links:
     ios / android   ""            -> renders a greyed, non-clickable
                                      "Coming soon" chip for that platform
                     "https://..." -> renders that platform's official
                                      store badge as a link

   The "Out now" / "Coming soon" card tag is derived automatically:
   if EITHER link is set, the game shows "Out now".

   Images: point at the OPTIMISED derivatives, not the raw sources.
   After dropping new art into assets/, run:  python3 tools/optimize-assets.py
   (`thumb` loads with the card; `full` only when the lightbox opens.)

   No HTML changes are ever required.
   ============================================================= */

window.GAMES = [
  {
    id: "fruit-sort-n-merge",
    title: "Fruit Sort N Merge",
    oneLiner: "Sort. Merge. Relax.",

    // Game logo / app icon. Square, 192px (2x of its 84px box).
    // Generated from assets/fsm-icon.svg by tools/optimize-assets.py.
    // Left decorative on purpose: the game title sits right next to it, so
    // a screen reader announcing both would just repeat itself. Set
    // `iconAlt` only if the icon carries meaning the title doesn't.
    icon: "assets/fsm-icon.webp",

    description:
      "A relaxing puzzle with a twist — part color-sort, part fruit-merge. Pick a container of stacked fruit, drop the top fruit onto a matching one, and the two combine into a higher-tier fruit. Keep going until every stack is solved and only the final fruit remains.",
    features: [
      "One-tap gameplay anyone can pick up",
      "Hundreds of brain-teasing levels",
      "Play completely offline — no internet needed",
      "Calm, colorful, and free to play"
    ],
    screenshots: [
      {
        thumb: "assets/fsm-1-thumb.webp",
        full: "assets/fsm-1-full.webp",
        alt: "Fruit Sort N Merge gameplay: containers holding stacks of mixed fruit, waiting to be sorted."
      },
      {
        thumb: "assets/fsm-2-thumb.webp",
        full: "assets/fsm-2-full.webp",
        alt: "Two matching fruits combining into a single higher-tier fruit."
      },
      {
        thumb: "assets/fsm-3-thumb.webp",
        full: "assets/fsm-3-full.webp",
        alt: "A completed level with every stack solved and one final fruit remaining."
      }
    ],

    // Paste the store URLs here when the app is approved.
    ios: "",
    android: "https://play.google.com/store/apps/details?id=com.technicgames.FruitSortNMerge"
  }
];
