// Lumen Home catalogue. Every product, name and review here is fictional.
// To swap a photo: drop an 800 x 1000 JPG into /images and change the product's `image:` line.
// Seeded reviews are [name, rating, text, daysAgo].
window.LUMEN_PRODUCTS = [
  // Lighting
  {
    id: "halo-lamp", name: "Halo floor lamp", category: "Lighting", price: 129, stock: 14,
    image: "images/halo-lamp.jpg",
    alt: "A tall wooden floor lamp with a glowing vertical light strip in a bright concrete room",
    credit: { by: "Puscas Adryan", url: "https://unsplash.com/photos/bfOmSCQQHKQ" },
    blurb: "A slim oak column with a soft strip of light down its centre. It lights a corner without lighting up the whole room.",
    details: ["Solid oak with a frosted diffuser", "150 cm tall, 22 cm wide", "Warm 2700K LED, dimmable foot switch"],
    reviews: [
      ["Mei", 5, "Exactly the glow I wanted for the reading corner. Not too bright at all.", 12],
      ["Arjun", 4, "Lovely lamp. The foot switch is a bit stiff for the first week.", 30],
      ["Siti", 3, "Looks great, but the cable is shorter than I hoped.", 46]
    ]
  },
  {
    id: "ember-lamp", name: "Ember table lamp", category: "Lighting", price: 89, stock: 22,
    image: "images/ember-lamp.jpg",
    alt: "A glass table lamp with a glowing bulb on a white bedside table",
    credit: { by: "Christopher Jolly", url: "https://unsplash.com/photos/GqbU78bdJFM" },
    blurb: "A clear glass cylinder on a slim black stem. The bulb looks like a small flame on your bedside table.",
    details: ["Hand-blown glass shade, powder-coated steel", "42 cm tall", "E27 bulb included, in-line switch"],
    reviews: [
      ["Daniel", 5, "Beautiful at night. The glass is thicker than it looks in photos.", 8],
      ["Wei Ling", 3, "Nice lamp, but the switch is hard to find in the dark.", 21],
      ["Hafiz", 2, "The shade arrived with a small chip. It still works, but I was disappointed.", 40]
    ]
  },
  {
    id: "facet-pendant", name: "Facet pendant light", category: "Lighting", price: 74, stock: 18,
    image: "images/facet-pendant.jpg",
    alt: "A black geometric wire pendant light hanging against a white wall",
    credit: { by: "Tormius", url: "https://unsplash.com/photos/VtppxC-GfZs" },
    blurb: "A thin wire frame that throws gentle patterns on the ceiling. Hang one over a table or three in a row.",
    details: ["Matte black steel wire", "Frame 20 x 24 cm, 120 cm adjustable cord", "Needs a fitted ceiling point"],
    reviews: [
      ["Priya", 5, "Our dining table finally has a centrepiece. Easy to hang.", 5],
      ["Ken", 4, "Good quality wire frame. Bulb not included, which I missed.", 19],
      ["Joanne", 3, "Pretty, but it swings a little under the ceiling fan.", 55]
    ]
  },
  // Furniture
  {
    id: "oak-side-table", name: "Oak side table", category: "Furniture", price: 149, stock: 9,
    image: "images/oak-side-table.jpg",
    alt: "A small open wooden side table holding books and a potted plant",
    credit: { by: "avery klein", url: "https://unsplash.com/photos/C_dRtsnBOQA" },
    blurb: "An open box of solid oak with room for a lamp on top and your current books below.",
    details: ["Solid white oak, oiled finish", "45 x 35 x 50 cm", "Arrives fully assembled"],
    reviews: [
      ["Grace", 5, "Solid and well made. The oil finish smells lovely.", 9],
      ["Marcus", 5, "Perfect next to the sofa. Fits a stack of magazines.", 33],
      ["Nurul", 3, "Nice table, but a little lower than I expected.", 61]
    ]
  },
  {
    id: "fern-chair", name: "Fern lounge chair", category: "Furniture", price: 320, stock: 6,
    image: "images/fern-chair.jpg",
    alt: "A light wooden armchair with white cushions in a sunny living room",
    credit: { by: "Amber Kipp", url: "https://unsplash.com/photos/Wg380n-aD7Q" },
    blurb: "A low ash frame with deep, removable cushions. Made for long afternoons and a cup of tea.",
    details: ["Ash frame, cotton-linen cushion covers", "72 x 78 x 74 cm, seat height 40 cm", "Covers are machine washable"],
    reviews: [
      ["Aisha", 5, "The comfiest chair in the flat. My cat agrees.", 14],
      ["Ravi", 4, "Great chair. Assembly took about 20 minutes.", 27],
      ["Ethan", 3, "Comfortable, but the cushions crease quickly.", 50]
    ]
  },
  {
    id: "birch-bookcase", name: "Birch wall bookcase", category: "Furniture", price: 279, stock: 5,
    image: "images/birch-bookcase.jpg",
    alt: "A tall white bookcase full of books along a living room wall",
    credit: { by: "Pickawood", url: "https://unsplash.com/photos/o_dokgznFKQ" },
    blurb: "Tall, quiet shelving in white-painted birch. Add units side by side as your library grows.",
    details: ["Painted birch plywood", "80 x 30 x 200 cm, five shelves", "Wall fixing kit included"],
    reviews: [
      ["Farah", 5, "Sturdy and simple. We bought a second one a month later.", 16],
      ["Sam", 4, "Holds a lot. The instructions could be clearer.", 38],
      ["Li Ting", 3, "Good value, but one shelf pin was missing.", 70]
    ]
  },
  // Kitchen
  {
    id: "mug-set", name: "Stoneware mug set", category: "Kitchen", price: 38, stock: 40,
    image: "images/mug-set.jpg",
    alt: "Two pale stoneware mugs on a white table against a dark wall",
    credit: { by: "Tom Crew", url: "https://unsplash.com/photos/INY4JowWde4" },
    blurb: "Two hand-glazed mugs with a speckled finish. Each one is a little different.",
    details: ["Set of two, stoneware", "350 ml each", "Dishwasher and microwave safe"],
    reviews: [
      ["Mei", 5, "Heavy in the hand and keeps tea warm. Lovely glaze.", 4],
      ["Daniel", 4, "Really nice. Slightly smaller than my old mugs.", 25],
      ["Hafiz", 3, "One mug had a small glaze bubble. Still use it daily.", 44]
    ]
  },
  {
    id: "ash-board", name: "Ash serving board", category: "Kitchen", price: 45, stock: 26,
    image: "images/ash-board.jpg",
    alt: "A rectangular light wooden board on a dark wood table with a fork and knife",
    credit: { by: "Sergey Kotenev", url: "https://unsplash.com/photos/KBsp1Grb8M4" },
    blurb: "A thick ash board for bread, cheese or chopping. It looks good enough to bring to the table.",
    details: ["Solid ash, food-safe oil", "45 x 25 x 2 cm", "Hand wash, oil now and then"],
    reviews: [
      ["Priya", 5, "Big enough for a whole loaf. Beautiful grain.", 11],
      ["Marcus", 4, "Good board. Needed an extra oiling at the start.", 29],
      ["Grace", 3, "Nice, but it is heavier than I expected.", 58]
    ]
  },
  {
    id: "pour-kettle", name: "Steel pour-over kettle", category: "Kitchen", price: 59, stock: 17,
    image: "images/pour-kettle.jpg",
    alt: "A brushed steel gooseneck kettle on a dark stovetop",
    credit: { by: "Ryan Jvr", url: "https://unsplash.com/photos/Jpho238RtqY" },
    blurb: "A gooseneck kettle with a slow, steady pour. It makes morning coffee feel like a small ritual.",
    details: ["Brushed stainless steel", "1 litre", "Works on gas and induction"],
    reviews: [
      ["Ken", 5, "Pours exactly where I want. Coffee has never been easier.", 7],
      ["Joanne", 5, "Looks great on the stove. Handle stays cool.", 22],
      ["Sam", 3, "Works well, but the lid is a bit loose.", 49]
    ]
  },
  // Textiles
  {
    id: "knit-throw", name: "Cotton knit throw", category: "Textiles", price: 69, stock: 20,
    image: "images/knit-throw.jpg",
    alt: "A cream knitted throw blanket folded across a neatly made bed",
    credit: { by: "Clay Banks", url: "https://unsplash.com/photos/hvlcPTCVxsQ" },
    blurb: "A chunky cotton knit that is warm without being heavy. Good for air-conditioned evenings.",
    details: ["100% organic cotton", "130 x 170 cm", "Machine wash cold, dry flat"],
    reviews: [
      ["Siti", 5, "So soft. It lives on the sofa now.", 6],
      ["Ravi", 4, "Lovely texture. Sheds a little in the first wash.", 31],
      ["Aisha", 3, "Nice throw, but smaller than I imagined.", 52]
    ]
  },
  {
    id: "wool-cushion", name: "Wool cushion cover", category: "Textiles", price: 32, stock: 35,
    image: "images/wool-cushion.jpg",
    alt: "Navy and pale blue cushions on a light grey sofa",
    credit: { by: "blocks", url: "https://unsplash.com/photos/Li4q_z15h18" },
    blurb: "A soft wool-blend cover in deep navy or dusk blue. Hidden zip, insert sold separately.",
    details: ["70% wool, 30% cotton", "45 x 45 cm", "Dry clean or gentle hand wash"],
    reviews: [
      ["Wei Ling", 5, "The navy is rich and the zip is well hidden.", 10],
      ["Ethan", 4, "Feels quality. Wish the insert came with it.", 24],
      ["Nurul", 3, "Colour is a bit darker than the photo.", 47]
    ]
  },
  {
    id: "jute-rug", name: "Scallop jute rug", category: "Textiles", price: 119, stock: 11,
    image: "images/jute-rug.jpg",
    alt: "A round braided jute rug with a white scalloped edge, half rolled on a wooden floor",
    credit: { by: "MKMHomes Craft", url: "https://unsplash.com/photos/uxHwYYWu5Sk" },
    blurb: "A round, hand-braided jute rug with a soft cotton scallop edge. Warm underfoot.",
    details: ["Natural jute with cotton border", "120 cm across", "Spot clean only"],
    reviews: [
      ["Li Ting", 5, "Makes the bedroom feel finished. Very well made.", 13],
      ["Farah", 4, "Lovely, though it took a few days to lie flat.", 35],
      ["Daniel", 3, "Nice rug, but it is a little scratchy on bare feet.", 63]
    ]
  },
  // Decor
  {
    id: "pebble-vase", name: "Pebble ceramic vase", category: "Decor", price: 42, stock: 24,
    image: "images/pebble-vase.jpg",
    alt: "A round matte white vase holding dried grasses on a wooden console",
    credit: { by: "Angela Bailey", url: "https://unsplash.com/photos/tuJtzghMuEw" },
    blurb: "A round, matte vase with a narrow neck. It holds a few dried stems without any fuss.",
    details: ["Matte glazed ceramic", "18 cm tall, 14 cm wide", "Watertight inside"],
    reviews: [
      ["Grace", 5, "Simple and calm. Looks lovely with dried grass.", 3],
      ["Arjun", 5, "Great size for a shelf.", 18],
      ["Joanne", 3, "Pretty, but the neck is too narrow for fresh flowers.", 42]
    ]
  },
  {
    id: "loop-mirror", name: "Loop wall mirror", category: "Decor", price: 135, stock: 8,
    image: "images/loop-mirror.jpg",
    alt: "A round mirror with a thin brass frame hanging from a black leather strap on marble",
    credit: { by: "Tile Merchant Ireland", url: "https://unsplash.com/photos/BqYUwF9IQkc" },
    blurb: "A round mirror with a thin brass rim, hung from a leather strap. It bounces light around small rooms.",
    details: ["Brass-finish steel frame, leather strap", "60 cm across", "Hook and fixings included"],
    reviews: [
      ["Priya", 5, "Makes our hallway feel twice the size.", 15],
      ["Ken", 4, "Lovely mirror. The strap smelled of leather for a week.", 28],
      ["Siti", 3, "Nice, but I had to buy a stronger wall hook.", 57]
    ]
  },
  {
    id: "candle-trio", name: "Quiet hour candle set", category: "Decor", price: 28, stock: 50,
    image: "images/candle-trio.jpg",
    alt: "Two lit cream pillar candles beside a glass reed diffuser on a pale blue background",
    credit: { by: "Mediamodifier", url: "https://unsplash.com/photos/EUl-7LZ9EZo" },
    blurb: "Two soy pillar candles and a reed diffuser, scented with cedar and fig. A calm end to the day.",
    details: ["Soy wax, cotton wicks", "Two pillars (7 cm and 10 cm), 100 ml diffuser", "About 30 hours burn time each"],
    reviews: [
      ["Aisha", 5, "The fig scent is lovely and the candles burn clean.", 2],
      ["Marcus", 4, "Nice scent, not too strong. The diffuser lasts well.", 20],
      ["Wei Ling", 3, "Good, but the tall candle tunnelled a little.", 39]
    ]
  },
  // Storage
  {
    id: "seagrass-basket", name: "Seagrass storage basket", category: "Storage", price: 39, stock: 30,
    image: "images/seagrass-basket.jpg",
    alt: "A woven seagrass basket with handles at the foot of white stairs",
    credit: { by: "Annie Spratt", url: "https://unsplash.com/photos/rtl8Os9mGA4" },
    blurb: "A tall woven basket with rope handles. Good for blankets, toys or the laundry pile.",
    details: ["Hand-woven seagrass", "40 cm tall, 35 cm wide", "Folds flat for storage"],
    reviews: [
      ["Ethan", 5, "Holds all our throws. Looks great by the stairs.", 9],
      ["Nurul", 3, "Nice basket, but it leans a little when half empty.", 26],
      ["Ravi", 2, "One handle came loose after two weeks. Hoping for a fix.", 37]
    ]
  },
  {
    id: "pantry-jars", name: "Glass pantry jar set", category: "Storage", price: 34, stock: 28,
    image: "images/pantry-jars.jpg",
    alt: "Two clear glass jars with wooden lids on a floating kitchen shelf",
    credit: { by: "Uliana Kopanytsia", url: "https://unsplash.com/photos/Exf1N6_UTZM" },
    blurb: "Two clear jars with airtight beech lids. Your rice and oats, on display and fresh.",
    details: ["Borosilicate glass, beech lids", "Set of two, 1.2 litre each", "Silicone seal keeps food fresh"],
    reviews: [
      ["Joanne", 5, "Airtight and so tidy on the shelf.", 6],
      ["Sam", 4, "Good jars. Lids are hand wash only.", 23],
      ["Li Ting", 3, "Fine, but the seal is fiddly to fit back on.", 48]
    ]
  },
  {
    id: "hook-rail", name: "Hallway hook rail", category: "Storage", price: 24, stock: 33,
    image: "images/hook-rail.jpg",
    alt: "A coat and hat hanging from wall hooks in a bright white hallway",
    credit: { by: "Velizar Ivanov", url: "https://unsplash.com/photos/NZQvHNOe-lw" },
    blurb: "A slim rail with four black hooks for coats, bags and keys by the door.",
    details: ["Oiled ash rail, steel hooks", "60 cm long, four hooks", "Screws and wall plugs included"],
    reviews: [
      ["Hafiz", 5, "Took ten minutes to put up. Very solid.", 11],
      ["Grace", 4, "Clean look. Hooks could be a little deeper.", 34],
      ["Arjun", 3, "Fine, but heavy bags slide off the ends.", 59]
    ]
  }
];

window.LUMEN_CATEGORIES = ["Lighting", "Furniture", "Kitchen", "Textiles", "Decor", "Storage"];
