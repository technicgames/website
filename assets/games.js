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

   No HTML changes are ever required.
   ============================================================= */

window.GAMES = [
  {
    id: "fruit-sort-n-merge",
    title: "Fruit Sort N Merge",
    oneLiner: "Sort. Merge. Relax.",

    // Game logo / app icon. Square. Swap in the real store icon when ready
    // (e.g. "assets/fsm-icon.png") — this is the only line that changes.
    // Left decorative on purpose: the game title sits right next to it, so
    // a screen reader announcing both would just repeat itself. Set
    // `iconAlt` only if the icon carries meaning the title doesn't.
    icon: "assets/fsm-icon.svg",
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
        src: "assets/fsm-1.jpg",
        alt: "Fruit Sort N Merge gameplay: containers holding stacks of mixed fruit, waiting to be sorted."
      },
      {
        src: "assets/fsm-2.jpg",
        alt: "Two matching fruits combining into a single higher-tier fruit."
      },
      {
        src: "assets/fsm-3.jpg",
        alt: "A completed level with every stack solved and one final fruit remaining."
      }
    ],

    // Paste the store URLs here when the app is approved.
    ios: "",
    android: "https://play.google.com/store/apps/details?id=com.technicgames.FruitSortNMerge"
  }
];
