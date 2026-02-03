import mcu from "./mcu.collection.js";
import mutant from "./mutant.collection.js";
import sony from "./sony.collection.js";
import voids from "./void.collection.js";
import lego from "./lego.collection.js";
import classics from "./classics.collection.js";
import animated from "./animated.collection.js";
import anime from "./anime.collection.js";

export default {
  title: "Marvel",

  categories: [
    { key: "mcu", title: "MCU" },
    { key: "mutant", title: "Mutant Saga" },
    { key: "sony", title: "Sony Spider-Man Universe" },
    { key: "void", title: "The Void" },
    { key: "lego", title: "LEGO" },
    { key: "classics", title: "Marvel Classics" },
    { key: "animated", title: "Animated Series" },
    { key: "anime", title: "Anime" }
  ],

  libs: {
    mcu,
    mutant,
    sony,
    void: voids,
    lego,
    classics,
    animated,
    anime
  }
};
