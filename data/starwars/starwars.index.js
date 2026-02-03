import canon from "./canon.collection.js";
import noncanon from "./noncanon.collection.js";
import vintage from "./vintage.collection.js";
import lego from "./lego.collection.js";

export default {
  title: "Star Wars",
  categories: [
    { key:"canon", title:"Canon" },
    { key:"noncanon", title:"Non-Canon" },
    { key:"vintage", title:"Vintage" },
    { key:"lego", title:"LEGO" },
  ],
  libs: { canon, noncanon, vintage, lego }
};
