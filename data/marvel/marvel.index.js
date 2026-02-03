export default {
  title: "Marvel",
  categories: [
    { key: "mcu",      title: "MCU",                    file: "./data/marvel/mcu.collection.js" },
    { key: "mutant",   title: "Mutant Saga",            file: "./data/marvel/mutant.collection.js" },
    { key: "sony",     title: "Sony's Spider-Man Universe", file: "./data/marvel/sony.collection.js" },
    { key: "void",     title: "The Void",               file: "./data/marvel/void.collection.js" },
    { key: "lego",     title: "LEGO",                   file: "./data/marvel/lego.collection.js" },
    { key: "classics", title: "Marvel Klasikleri",      file: "./data/marvel/classics.collection.js" },
    { key: "animated", title: "Marvel Animations",      file: "./data/marvel/animated.collection.js" },
    { key: "anime",    title: "Marvel Anime",           file: "./data/marvel/anime.collection.js" }
  ],

  // app.js eski "libs" yapısını da arıyorsa diye geriye dönük uyumluluk:
  libs: {
    mcu: "./data/marvel/mcu.collection.js",
    mutant: "./data/marvel/mutant.collection.js",
    sony: "./data/marvel/sony.collection.js",
    void: "./data/marvel/void.collection.js",
    lego: "./data/marvel/lego.collection.js",
    classics: "./data/marvel/classics.collection.js",
    animated: "./data/marvel/animated.collection.js",
    anime: "./data/marvel/anime.collection.js"
  }
};
