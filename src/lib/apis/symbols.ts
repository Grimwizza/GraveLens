// ── Symbol meanings database ───────────────────────────────────────────────
// Matches Claude's symbol descriptions to historical/cultural context.
// All content is verifiable historical fact — no AI generation needed.

export interface SymbolInterpretation {
  name: string;
  category: "religious" | "fraternal" | "funerary" | "military" | "floral" | "civic";
  meaning: string;
  era?: string;
}

interface SymbolEntry extends SymbolInterpretation {
  keywords: string[];
}

const SYMBOL_DB: SymbolEntry[] = [
  // ── Religious ────────────────────────────────────────────────────────────────
  {
    name: "IHS Christogram",
    keywords: ["ihs", "christogram", "ihc"],
    category: "religious",
    meaning:
      "The IHS monogram derives from the first three letters of Jesus's name in Greek (ΙΗΣΟΥΣ). It is one of the oldest Christian symbols, in use since at least the 3rd century and popularized widely by the Jesuit order in the 16th century.",
    era: "Common across all eras of Christian burial",
  },
  {
    name: "Chi-Rho",
    keywords: ["chi-rho", "chi rho", "labarum", "☧"],
    category: "religious",
    meaning:
      "The Chi-Rho (☧) is formed from the first two letters of 'Christ' in Greek (Χριστός). Emperor Constantine adopted it as a military emblem after reportedly seeing it in a vision before the Battle of Milvian Bridge in 312 AD. It remains one of the earliest distinctly Christian symbols.",
    era: "Early Christian through Victorian era",
  },
  {
    name: "Latin Cross",
    keywords: ["latin cross", "christian cross", "plain cross"],
    category: "religious",
    meaning:
      "The Latin cross is the primary symbol of Christianity, representing the crucifixion and resurrection of Jesus. Plain Latin crosses often indicate Protestant affiliation; highly ornate crosses suggest Catholic or Anglican tradition.",
  },
  {
    name: "Celtic Cross",
    keywords: ["celtic cross"],
    category: "religious",
    meaning:
      "The Celtic cross combines a cross with a circle at the intersection. It is associated with Irish, Scottish, and Welsh Christian traditions and is strongly associated with families of Irish or Scots-Irish descent. Proliferating in American cemeteries after the great waves of Irish immigration following the 1840s famine.",
    era: "Mid-19th through early 20th century",
  },
  {
    name: "Dove",
    keywords: ["dove"],
    category: "religious",
    meaning:
      "The dove is a symbol of peace, purity, and the Holy Spirit. On grave markers it represents the soul ascending to heaven or the peace of God received at death. A dove carrying an olive branch recalls the Genesis flood narrative and the promise of peace between God and humanity.",
  },
  {
    name: "Lamb",
    keywords: ["lamb"],
    category: "religious",
    meaning:
      "The lamb is a symbol of innocence and of Christ as the 'Lamb of God.' On 19th-century markers a lamb almost always marks the grave of an infant or young child — a life of purity that was never touched by sin. It offers grieving parents the assurance that their child was welcomed into heaven.",
    era: "Victorian era (1837–1901)",
  },
  {
    name: "Anchor",
    keywords: ["anchor"],
    category: "religious",
    meaning:
      "The anchor is among the earliest Christian symbols, derived from Hebrews 6:19: 'We have this hope as an anchor for the soul.' It represents hope, steadfast faith, and salvation. Common in coastal communities and on sailors' graves — the anchor that holds even in life's stormiest waters.",
  },
  {
    name: "Alpha and Omega",
    keywords: ["alpha", "omega", "alpha and omega"],
    category: "religious",
    meaning:
      "Alpha (Α) and Omega (Ω) — the first and last letters of the Greek alphabet — represent God as the beginning and end of all things. From Revelation 22:13: 'I am the Alpha and the Omega, the First and the Last, the Beginning and the End.'",
  },
  {
    name: "Open Bible",
    keywords: ["open book", "open bible", "bible", "book"],
    category: "religious",
    meaning:
      "An open book on a grave marker most often represents the Bible, signifying a life lived by faith and Scripture. It may also represent the Book of Life in which the names of the righteous are written, or the account of a life now open before God's judgment.",
  },
  {
    name: "Star of David",
    keywords: ["star of david", "jewish star", "magen david", "hexagram"],
    category: "religious",
    meaning:
      "The Star of David (Magen David) is the primary symbol of Judaism and Jewish identity. Jewish-American cemeteries contain some of the most historically significant records of immigrant communities in the United States, documenting waves of immigration from Germany (1840s), Eastern Europe (1880s–1920s), and beyond.",
  },
  {
    name: "Palm Branch",
    keywords: ["palm", "palm branch", "palm frond"],
    category: "religious",
    meaning:
      "The palm branch is an ancient symbol of victory, triumph, and peace. In Christian tradition it represents victory over death and entry into eternal life — derived from the palm branches waved at Jesus's triumphal entry into Jerusalem on what is now celebrated as Palm Sunday.",
  },
  // ── Funerary ─────────────────────────────────────────────────────────────────
  {
    name: "Weeping Willow",
    keywords: ["weeping willow", "willow tree", "willow"],
    category: "funerary",
    meaning:
      "The weeping willow is one of the most common 18th and early 19th-century funerary symbols, representing grief, mourning, and sorrow. Its drooping branches evoke weeping and lamentation over loss. Particularly prevalent in the early American Federal period (1780–1820), often paired with a draped urn.",
    era: "Federal and early Victorian era (1780–1860)",
  },
  {
    name: "Broken Column",
    keywords: ["broken column", "truncated column"],
    category: "funerary",
    meaning:
      "A broken column symbolizes a life cut short — the pillar of strength in a family or community that has fallen. It was especially popular in the Victorian era for young adults or family patriarchs whose death left a community diminished. The taller the column, the longer the life it represented.",
    era: "Victorian era (1837–1901)",
  },
  {
    name: "Hourglass",
    keywords: ["hourglass", "hour glass", "sand glass"],
    category: "funerary",
    meaning:
      "The hourglass is a memento mori — a reminder of mortality — representing the passage of time and the inevitability of death. Often depicted with wings (the 'winged hourglass'), signifying that time flies. Most common in 17th and 18th-century Puritan burial grounds of New England.",
    era: "Colonial through early 19th century",
  },
  {
    name: "Scythe",
    keywords: ["scythe"],
    category: "funerary",
    meaning:
      "The scythe is a memento mori symbol associated with the Grim Reaper — death as the great harvester of souls. It represents death as the great equalizer, harvesting lives as a farmer harvests wheat without regard for status, wealth, or age.",
    era: "Colonial through Victorian era",
  },
  {
    name: "Clasped Hands",
    keywords: ["clasped hands", "handshake", "clasping hands", "shaking hands"],
    category: "funerary",
    meaning:
      "Two clasped hands carry multiple meanings depending on context. When a man's cuffed sleeve clasps a woman's bare hand, it traditionally represents a husband bidding farewell to his wife (or vice versa) — the last handshake at the threshold of death. It can also represent the bond of marriage, or membership in a fraternal organization.",
  },
  {
    name: "Draped Urn",
    keywords: ["draped urn", "funerary urn", "urn"],
    category: "funerary",
    meaning:
      "The draped funerary urn is a Neoclassical symbol of mourning adopted from ancient Greek and Roman death rituals. The cloth draped over the urn symbolizes mourning and the concealment of grief. Enormously popular in American cemeteries from 1780 to 1850 during the Greek Revival period.",
    era: "Federal and early Victorian era (1780–1850)",
  },
  {
    name: "Inverted Torch",
    keywords: ["inverted torch", "torch"],
    category: "funerary",
    meaning:
      "An inverted torch symbolizes a life extinguished — the flame turned downward. Derived from classical antiquity where torch-bearers flanked funeral processions, it was revived during the Neoclassical period of the late 18th and early 19th centuries. An upright burning torch represents eternal life.",
    era: "Victorian era (1837–1901)",
  },
  {
    name: "Pointing Hand",
    keywords: ["finger pointing", "pointing hand", "index finger", "hand pointing up", "pointing upward"],
    category: "funerary",
    meaning:
      "A carved hand with an index finger pointing skyward is a Victorian symbol of heavenly reward, indicating that the soul has ascended to heaven. It offers comfort to the bereaved — this person has gone to a better place. Often inscribed with words like 'Gone Home' or 'Asleep in Jesus.'",
    era: "Victorian era (1837–1901)",
  },
  {
    name: "Angel",
    keywords: ["angel", "cherub", "seraph"],
    category: "funerary",
    meaning:
      "Angels on grave markers serve multiple roles: guardian angels watch over the deceased, weeping angels represent grief and mourning, and triumphant angels with upward gaze signal resurrection and eternal life. Enormously popular in Victorian cemetery art, particularly in the elaborate marble statuary of wealthy families.",
    era: "Victorian through early 20th century",
  },
  {
    name: "Tree Stump",
    keywords: ["tree stump", "tree trunk", "log"],
    category: "funerary",
    meaning:
      "A tree stump or cut log is the distinctive marker of the Woodmen of the World fraternal organization, founded in 1890. The WOW provided free grave markers to members — the iconic stump (typically cast concrete or zinc to resemble a cut log) remains one of the most recognizable fraternal grave markers in American cemeteries, especially across the Midwest and South.",
    era: "Late 19th through mid-20th century",
  },
  // ── Floral ───────────────────────────────────────────────────────────────────
  {
    name: "Rose",
    keywords: ["rose"],
    category: "floral",
    meaning:
      "The rose carries layered meanings: earthly beauty that fades (memento mori), love and remembrance, and in Christianity, the Virgin Mary. A rosebud on a child's grave represents a life not yet fully opened; a full bloom suggests a life fulfilled in its time. Red roses mean love; white roses mean purity.",
  },
  {
    name: "Lily",
    keywords: ["lily"],
    category: "floral",
    meaning:
      "The lily symbolizes purity, innocence, and resurrection. The Easter lily is specifically associated with Christ's resurrection and eternal life. On women's graves it often symbolizes purity of character; on children's graves, innocence. The fleur-de-lis (a stylized lily) carries additional heraldic and French Catholic associations.",
  },
  {
    name: "Ivy",
    keywords: ["ivy"],
    category: "floral",
    meaning:
      "Ivy, which clings persistently and grows year-round, symbolizes undying memory, fidelity, and eternal friendship. Its evergreen nature represents immortality — the memory of the deceased continuing to grow and endure beyond death itself.",
  },
  {
    name: "Forget-Me-Not",
    keywords: ["forget-me-not", "forget me not"],
    category: "floral",
    meaning:
      "The forget-me-not is the flower of remembrance and enduring love. Its name is the message: do not forget me. A popular Victorian mourning symbol appearing frequently on women's and children's markers of the late 19th century, often accompanied by the simple sentiment 'In loving memory.'",
    era: "Victorian era (1837–1901)",
  },
  {
    name: "Oak Leaves and Acorn",
    keywords: ["oak", "acorn", "oak leaves"],
    category: "floral",
    meaning:
      "Oak leaves and acorns symbolize strength, endurance, and longevity. They frequently appear on the markers of community leaders, patriarchs, and those who lived to old age — the great oak brought low only by the full passage of time, never by weakness.",
  },
  {
    name: "Thistle",
    keywords: ["thistle"],
    category: "floral",
    meaning:
      "The thistle is the national emblem of Scotland. On grave markers it strongly indicates Scottish heritage. Scotland contributed enormous numbers of immigrants to America, particularly in the 18th century Scots-Irish settlements of Appalachia and the mid-Atlantic colonies.",
  },
  {
    name: "Shamrock",
    keywords: ["shamrock", "clover"],
    category: "floral",
    meaning:
      "The shamrock is the national symbol of Ireland, associated with St. Patrick's use of the three-leaf clover to explain the Holy Trinity. On grave markers it indicates Irish heritage. Irish immigration to America peaked in the 1840s–1860s following the Great Famine, creating substantial Irish-American communities in Boston, New York, Chicago, and beyond.",
  },
  // ── Fraternal ────────────────────────────────────────────────────────────────
  {
    name: "Masonic Square and Compass",
    keywords: ["masonic", "square and compass", "freemason", "mason", "freemasonry", "g within compass"],
    category: "fraternal",
    meaning:
      "The square and compass is the central emblem of Freemasonry, one of the oldest and largest fraternal organizations in the world. The square represents moral rectitude; the compass symbolizes keeping one's desires within due bounds. The letter 'G' stands for both God and Geometry. Freemasonry spread widely in colonial America — George Washington, Benjamin Franklin, Paul Revere, and many Founding Fathers were members.",
    era: "Colonial era to present",
  },
  {
    name: "Odd Fellows Three Links",
    keywords: ["odd fellows", "three links", "ioof", "i.o.o.f.", "three chain links"],
    category: "fraternal",
    meaning:
      "The three interlocked chain links are the emblem of the Independent Order of Odd Fellows (IOOF), one of the largest fraternal organizations in 19th-century America. The three links stand for Friendship, Love, and Truth. The Odd Fellows provided vital mutual aid before the age of social security: sick benefits, death benefits, and care for orphaned children of members.",
    era: "19th through early 20th century",
  },
  {
    name: "Knights of Pythias",
    keywords: ["knights of pythias", "pythias", "fcb"],
    category: "fraternal",
    meaning:
      "The Knights of Pythias was founded in Washington, D.C. in 1864 at the height of the Civil War, with the motto 'Friendship, Charity, and Benevolence.' Abraham Lincoln expressed support for the order's ideals of reconciliation. The FCB initials and its shield and helmet insignia appear on members' graves.",
    era: "Late 19th through early 20th century",
  },
  {
    name: "Woodmen of the World",
    keywords: ["woodmen of the world", "wow", "woodmen", "w.o.w."],
    category: "fraternal",
    meaning:
      "The Woodmen of the World was a fraternal benefit society founded in 1890. The organization is remembered for providing free grave markers to members — the iconic tree-stump or log headstone (cast in concrete or zinc to resemble a cut log with bark and branches) is its signature. Thousands of these distinctive markers stand in cemeteries across the American Midwest and South.",
    era: "Late 19th through mid-20th century",
  },
  {
    name: "Order of the Eastern Star",
    keywords: ["eastern star", "order of the eastern star", "oes", "five-pointed star"],
    category: "fraternal",
    meaning:
      "The Order of the Eastern Star is a Masonic-affiliated fraternal organization open to both men and women — unique among major fraternal orders of the 19th century. Its five-pointed star contains five colored points representing biblical heroines: Adah, Ruth, Esther, Martha, and Electa. Founded in 1850, it became one of the largest fraternal organizations in the world.",
    era: "Late 19th century to present",
  },
  {
    name: "Benevolent and Protective Order of Elks",
    keywords: ["elks", "bpoe", "b.p.o.e.", "elk"],
    category: "fraternal",
    meaning:
      "The Benevolent and Protective Order of Elks (BPOE) was founded in New York City in 1868. Its emblem features an elk head and a clock showing 11 o'clock — the 'Eleven O'Clock Toast' honoring absent members ('To our absent members') is a cornerstone ritual. The Elks became one of the most prominent civic fraternal organizations in early 20th-century America.",
    era: "Late 19th through mid-20th century",
  },
  {
    name: "Grand Army of the Republic",
    keywords: ["grand army", "g.a.r.", "gar"],
    category: "fraternal",
    meaning:
      "The Grand Army of the Republic (GAR) was a fraternal organization composed of Union Army veterans of the Civil War, founded in 1866. At its peak in 1890 it had over 400,000 members. The GAR was enormously influential in American politics and culture, lobbying for veterans' pensions and establishing Memorial Day as a national tradition.",
    era: "Post-Civil War (1866–1956)",
  },
  {
    name: "Spanish-American War Veterans",
    keywords: ["uss maine", "spanish war", "veterans of foreign wars", "vfw"],
    category: "fraternal",
    meaning:
      "The Veterans of Foreign Wars (VFW) was founded in 1899 by Spanish-American War veterans, becoming the primary organization for American veterans of overseas service. VFW markers indicate military service in foreign conflicts from the Spanish-American War forward.",
    era: "Late 19th century to present",
  },
  // ── Military ─────────────────────────────────────────────────────────────────
  {
    name: "U.S. Army Emblem",
    keywords: ["us army", "u.s. army", "army emblem", "army insignia", "army seal"],
    category: "military",
    meaning:
      "The official emblem of the United States Army. Government-issued military grave markers from the Veterans Administration display branch emblems identifying service. Free government markers have been provided to eligible veterans since the Act of 1879, which established the national tradition of honoring military service in death.",
  },
  {
    name: "U.S. Navy Emblem",
    keywords: ["us navy", "u.s. navy", "navy emblem", "navy insignia", "naval"],
    category: "military",
    meaning:
      "The official emblem of the United States Navy, the oldest branch of the American armed forces (established 1775). Naval service markers are common in coastal states and Great Lakes communities with strong maritime traditions.",
  },
  {
    name: "U.S. Marine Corps Emblem",
    keywords: ["marine corps", "marines", "usmc", "eagle globe anchor"],
    category: "military",
    meaning:
      "The Eagle, Globe, and Anchor is the emblem of the United States Marine Corps. Marines have served in every major American conflict since 1775, earning a reputation as elite shock troops. The motto 'Semper Fidelis' (Always Faithful) appears on many Marine Corps markers.",
  },
  {
    name: "Purple Heart",
    keywords: ["purple heart"],
    category: "military",
    meaning:
      "The Purple Heart is awarded to military personnel wounded or killed in action against an enemy of the United States. Originally established by George Washington in 1782 as the Badge of Military Merit and reinstated in 1932, its presence on a grave marker is direct evidence of combat wounds sustained in the nation's defense.",
  },
  {
    name: "Eagle",
    keywords: ["eagle", "bald eagle"],
    category: "military",
    meaning:
      "The American bald eagle, the national symbol of the United States since 1782. On grave markers it frequently indicates military service, patriotic civic identity, or membership in organizations like the Fraternal Order of Eagles. When depicted with spread wings and arrows, it represents the power and vigilance of the republic.",
  },
];

/**
 * Match Claude's extracted symbol descriptions against the symbol database.
 * Returns a map from the original symbol description to its interpretation.
 * Unmatched symbols are omitted from the result.
 */
export function interpretSymbols(
  symbols: string[]
): Map<string, SymbolInterpretation> {
  const results = new Map<string, SymbolInterpretation>();

  for (const sym of symbols) {
    const lower = sym.toLowerCase();
    for (const entry of SYMBOL_DB) {
      if (entry.keywords.some((k) => lower.includes(k))) {
        results.set(sym, {
          name: entry.name,
          category: entry.category,
          meaning: entry.meaning,
          era: entry.era,
        });
        break;
      }
    }
  }

  return results;
}
