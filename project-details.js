// Project-level presentation. Image metadata and default ordering remain in projects.js.
// Set year to a string here to override the range derived from image metadata.
// Optional layout settings: order (filenames), layout: "single", compact (filenames),
// and focal: { image, left: [filenames], right: [filenames] }.
const projectIndexOrder = [
    "halfway_crooks", "poster_design", "offprint_concept", "run_club",
    "boeven", "sketchbook", "oil_paintings", "album_covers", "akira",
    "yoshitomo_nara", "helix_motors", "film"
];
const projectDetails = {
    run_club: {
        title: "Run Club",
        layout: "viewport-rows",
        lead: "running_playground.png",
        fullWidthRows: true,
        rows: [
            ["80srunning.webp", "HC_Running_2.webp", "lager_than_life2.webp"],
            ["puma_bigpeach_hc_poster_edited.webp", "board_games_night.webp", "twin_night.webp"]
        ]
    },
    halfway_crooks: {
        title: "Halfway Crooks",
        layout: "viewport-rows",
        stackGap: 24,
        stackInset: { left: 24, top: 24, bottom: 24 },
        order: [
            "FUNday_.webp", "stammtisch-green.webp", "stammtisch-1.webp",
            "staff_show_digital_01.webp", "roast_dinner_card_1080x1920.webp",
            "ig_post_final_czechbeerdays.webp", "ig_post_final_czechbeerdays_events.webp",
            "trivia_flyer_1080x1350_color.webp", "Eurovision_Poster.webp"
        ],
        rows: [
            ["ig_post_final_czechbeerdays.webp", "ig_post_final_czechbeerdays_events.webp", "staff_show_digital_01.webp"],
            ["FUNday_.webp", "trivia_flyer_1080x1350_color.webp", "Eurovision_Poster.webp"]
        ],
        stacks: [["stammtisch-green.webp", "stammtisch-1.webp"]]
    },
    boeven: {
        title: "Boeven",
        rowStackScale: .7,
        rowWidths: { 1: .5, 2: .4, 3: .8, 4: .8 },
        rowAlignments: { 1: "center", 2: "center", 3: "center", 4: "center" },
        rowGaps: { 3: 32 },
        viewportRow: 1,
        viewportRows: [2, 3, 4],
        viewportRowAlignments: { 2: "flex-start", 3: "flex-start", 4: "flex-start" },
        viewportRowScale: .8,
        rowBottomGaps: { 1: 24, 2: 24 },
        rowAlign: "left",
        credit: "Made in collaboration with Emma Freymann of Family Brothers.",
        layout: "viewport-rows",
        fullWidthRows: true,
        rows: [
            [["boevenbartype.webp", "HC_Building.webp"]],
            ["boeven_poster_final.webp"],
            ["Holiday_Hours_November.webp", "Holiday_Hours_December.webp"],
            ["Boeven_Menu_example.webp", "Boeven_Menu_example_back.webp"]
        ],
        order: [
            "boeven_poster_final.webp", "boevenbartype.webp", "HC_Building.webp",
            "Holiday_Hours_November.webp", "Holiday_Hours_December.webp"
        ],
        stacks: [["boevenbartype.webp", "HC_Building.webp"]],
    },
    akira: {
        title: "Akira",
        caption: "Illustrated Akira Zine, 2022",
        layout: "viewport-rows",
        order: [
            "FrontCover_Akira.webp", "akira.webp", "pg2_3_Akira.webp", "pg4_5_AKira.webp",
            "pg6_7_Akira.webp", "pg8_Akira.webp", "BackCover_Akira.webp"
        ]
    },
    poster_design: {
        title: "Poster Design", layout: "viewport-rows",
        caption: "Various posters I've made over the years that I think are worth sharing here.",
        fullWidthRows: true,
        gapPt: 12,
        rows: [
            ["basic_typography_poster.webp", "eameswirechair.webp", "ExhibitionPoster.webp"],
            ["whoaFINAL.webp", "whoa_poster1.webp", "whoa_poster2.webp"]
        ]
    },
    sketchbook: {
        title: "Sketchbook", caption: "Sketchbook scans 4 u.", width: .7,
        order: ["nicholas_scan01.webp", "nicholas_scan03.webp", "nicholas_scan04.webp", "nicholas_scan06.webp", "drawingspread.png"]
    },
    elsewhere_brewing: { title: "Elsewhere Brewing", width: .5 },
    tattoo_flash: { title: "Tattoo Flash", year: "2026", rowInsets: { 2: 24 }, rowGaps: { 2: 24 } },
    helix_motors: {
        title: "Helix Motors",
        year: "2022-2023",
        caption: "Internship for Helix Motors, 2022-2023",
        centeredPair: { images: ["helix_poster.webp", "hm_logo_3d.webp"], widths: [.4, .22], gap: 24, topSpacePt: 24 }
    },
    yoshitomo_nara: {
        title: "Yoshitomo Nara", width: .8,
        caption: "Museum Studies 'Yoshitomo Nara' Booklet, 2021",
        order: [
            "nara_FrontCover.webp", "nara_BackCover.webp", "nara_1st.webp",
            "nara_2-3.webp", "nara_4-5.webp", "nara_6-7.webp", "nara_8-9.webp",
            "nara_10-11.webp", "nara_12-13.webp", "nara_14-15.webp"
        ]
    },
    magazine_spreads: { title: "Magazine Spreads", width: .7 },
    album_covers: { title: "Album Covers" },
    offprint_concept: {
        title: "Offprint Concept",
        year: "2024",
        caption: "Offprint concept poster w/ custom typography details. 2024",
        blendImages: ["offprintdetails-02 jpg.webp", "offprint_TYPE.webp"]
    },
    throneroom: { title: "Throne Room" },
    valiantmarketing_concept: { title: "Valiant Marketing Concept" },
    film: { title: "Film" },
    snappingdogs: { title: "Snapping Dogs" },
    oil_paintings: {
        title: "Oil Paintings", year: "2025", layout: "viewport-rows",
        rows: [
            ["japanfleur.png", "rose.png", "sunflower.png"],
            ["tulip.png", "wildflower.webp"]
        ]
    }
};
