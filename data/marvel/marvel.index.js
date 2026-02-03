export default {
  title: "Marvel",
  categories: [
    { key:"mcu", title:"MCU" },
    { key:"mutant", title:"Mutant Saga" },
    { key:"sony", title:"Sony's Spider-Man Universe" },
    { key:"void", title:"The Void" },
    { key:"lego", title:"LEGO" },
    { key:"classics", title:"Marvel Klasiks" },
    { key:"animated", title:"Marvel Animated Series" },
    { key:"anime", title:"Marvel Anime" },
  ],
  // ÖNEMLİ: burada "dosya adı" string olacak, import yok.
  libs: {
    mcu: "mcu.collection.js",
    mutant: "mutant.collection.js",
    sony: "sony.collection.js",
    void: "void.collection.js",
    lego: "lego.collection.js",
    classics: "classics.collection.js",
    animated: "animated.collection.js",
    anime: "anime.collection.js"
  }
};