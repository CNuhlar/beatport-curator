// Curated DJ-set blueprints. Each set is one coherent arc — sections
// flow into each other and reference real artists / sub-genres so the
// strategy LLM can pull on-target Beatport search results.
//
// Used by the "🎲 RANDOMIZE" button on /build to seed all sections at
// once. Picking a set replaces the current sections (count, durations,
// prompts) — it's an exploration shortcut, not a partial fill.

export interface PromptSetSection {
  duration_min: number;
  prompt: string;
}

export interface PromptSet {
  id: string;
  name: string;
  vibe: string;
  sections: PromptSetSection[];
}

export const PROMPT_SETS: PromptSet[] = [
  {
    id: "late-night-peak-techno",
    name: "Late Night Peak Techno",
    vibe: "techno",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Deep dub techno opener, hypnotic and patient. Echocord, Quantec, Donato Dozzy. 120-124 BPM. Prepare the room without forcing it.",
      },
      {
        duration_min: 30,
        prompt:
          "Build into peak time. Charlotte de Witte, Amelie Lens, Kobosil. 130-135 BPM. Driving kicks, acid stabs, dark melodic moments.",
      },
      {
        duration_min: 15,
        prompt:
          "Wind down with melodic techno. Ben Klock, Stephan Bodzin, Innellea. 124-128 BPM. Emotional and restrained.",
      },
    ],
  },
  {
    id: "sunrise-open-air",
    name: "Sunrise Open Air",
    vibe: "melodic",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Ambient warmup, deep and warm. Khen, Hernan Cattaneo, Guy J. 118-122 BPM. Patient, takes its time, sets the mood.",
      },
      {
        duration_min: 25,
        prompt:
          "Progressive build, rolling and atmospheric. Patrice Bäumel, Jeremy Olander, Cid Inc. 122-126 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Sunrise peak, euphoric and uplifting. Tinlicker, Lane 8, Ben Böhmer. 124-128 BPM. Big melodic hands-up moments.",
      },
      {
        duration_min: 15,
        prompt:
          "Dawn closing, downtempo bliss. Marsh, Nils Hoffmann, Yotto. 116-120 BPM. Emotional landing.",
      },
    ],
  },
  {
    id: "acid-all-night",
    name: "Acid All Night",
    vibe: "acid",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Minimal acid warmup, restrained 303. Tin Man, Voiski, Gary Beck. 124-128 BPM. Slow burn with a constant squelch.",
      },
      {
        duration_min: 35,
        prompt:
          "Full acid frenzy. Hardfloor, Plastikman, Mr. C. 130-138 BPM. Squelchy 303 madness, classic acid anthems.",
      },
      {
        duration_min: 20,
        prompt:
          "Acid trance crossover, hypnotic and uplifting. Luke Slater, Surgeon, DJ Hell. 128-134 BPM.",
      },
    ],
  },
  {
    id: "deep-tech-house-sunday",
    name: "Deep Tech House Sunday",
    vibe: "tech-house",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Deep groove opener, soulful and patient. Argy, Dixon, Âme. 120-122 BPM. Sun-kissed terrace vibes.",
      },
      {
        duration_min: 30,
        prompt:
          "Bouncy tech house peak. Patrick Topping, Solardo, Riva Starr. 124-128 BPM. Funky and infectious.",
      },
      {
        duration_min: 15,
        prompt:
          "Late tech house, sleazy vocal samples. Hot Since 82, Steve Lawler, wAFF. 122-126 BPM.",
      },
    ],
  },
  {
    id: "hard-techno-warehouse",
    name: "Hard Techno Warehouse",
    vibe: "hard-techno",
    sections: [
      {
        duration_min: 10,
        prompt:
          "Pumping warmup, no nonsense. Trym, Sara Landry, Hayden. 138-142 BPM. Straight to business.",
      },
      {
        duration_min: 25,
        prompt:
          "Industrial peak, relentless. Perc, AnD, Phase Fatale. 142-150 BPM. Distorted kicks, harsh textures.",
      },
      {
        duration_min: 10,
        prompt:
          "Mental closing, peak madness. SPFDJ, KI/KI, Marlon Hoffstadt. 145-160 BPM.",
      },
    ],
  },
  {
    id: "progressive-house-journey",
    name: "Progressive House Journey",
    vibe: "progressive",
    sections: [
      {
        duration_min: 30,
        prompt:
          "Atmospheric warmup, deep and patient. Gui Boratto, Petar Dundov, Khen. 120-124 BPM.",
      },
      {
        duration_min: 35,
        prompt:
          "Building tension, rolling progressive. Sasha, John Digweed, Hernan Cattaneo. 122-126 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Euphoric peak, melodic and uplifting. Eric Prydz, Pryda, Cristoph. 126-130 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Emotional close, downtempo prog. Guy J, Sahar Z, Henry Saiz. 122-126 BPM.",
      },
    ],
  },
  {
    id: "minimal-microhouse",
    name: "Minimal Microhouse",
    vibe: "minimal",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Sparse opener, clicks and pops. Akufen, Ricardo Villalobos, Luciano. 122-126 BPM. Barely-there grooves.",
      },
      {
        duration_min: 30,
        prompt:
          "Clicky tech peak, microhouse Berghain style. Onur Özer, Petre Inspirescu, Cassy. 126-130 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Glitchy closer, broken percussion. Sleeparchive, Pär Grindvik. 124-128 BPM.",
      },
    ],
  },
  {
    id: "detroit-techno-tribute",
    name: "Detroit Techno Tribute",
    vibe: "techno",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Soulful warmup, classic Detroit. Carl Craig, Derrick May, Kenny Larkin. 122-126 BPM.",
      },
      {
        duration_min: 35,
        prompt:
          "Driving peak, machine soul. Jeff Mills, Robert Hood, Kevin Saunderson. 130-135 BPM.",
      },
      {
        duration_min: 20,
        prompt:
          "Cosmic closing, deep space. Underground Resistance, Drexciya, Theo Parrish. 122-128 BPM.",
      },
    ],
  },
  {
    id: "berlin-warehouse",
    name: "Berlin Warehouse",
    vibe: "techno",
    sections: [
      {
        duration_min: 25,
        prompt:
          "Dub techno opener, hypnotic patience. Basic Channel, Scion, Rod Modell. 120-124 BPM.",
      },
      {
        duration_min: 40,
        prompt:
          "Hypnotic build, looping and relentless. Marcel Dettmann, Ben Klock, Etapp Kyle. 128-134 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Closing pressure, distorted dub. Function, Norman Nodge, Ø [Phase]. 130-134 BPM.",
      },
    ],
  },
  {
    id: "trance-revival",
    name: "Trance Revival",
    vibe: "trance",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Uplifting build, classic 2000s vibe. Above & Beyond, Ferry Corsten, early Tiesto. 132-136 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Euphoric peak, anthemic trance. Armin van Buuren, Paul van Dyk, ATB. 136-140 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Emotional closing, breakdown trance. Way Out West, Chicane, Sasha. 130-134 BPM.",
      },
    ],
  },
  {
    id: "chicago-acid-house",
    name: "Chicago Acid House",
    vibe: "house",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Chicago warmup, smiley hands up. Phuture, DJ Pierre, Marshall Jefferson. 122-125 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "303 squelch peak, classic acid house. Frankie Knuckles, Mr. Fingers, Larry Heard. 124-128 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Acid house closing, soulful. Ron Trent, Chez Damier, Kerri Chandler. 120-124 BPM.",
      },
    ],
  },
  {
    id: "tribal-techno",
    name: "Tribal Techno",
    vibe: "tribal",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Percussive warmup, hand drums and shakers. Mihai Popoviciu, Hubie Davison. 124-128 BPM.",
      },
      {
        duration_min: 35,
        prompt:
          "Tribal peak, percussion-driven trance. Bedouin, Damian Lazarus, &ME. 124-128 BPM.",
      },
      {
        duration_min: 20,
        prompt:
          "Drum circle close, organic and earthy. Adriatique, Mind Against. 120-124 BPM.",
      },
    ],
  },
  {
    id: "italo-cosmic",
    name: "Italo Cosmic",
    vibe: "disco",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Disco warmup, classic Italo. Giorgio Moroder, Klein & MBO, Doctor's Cat. 110-118 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Cosmic peak, space disco. Lindstrøm, Prins Thomas, Todd Terje. 118-124 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Starlit close, dreamy and melodic. In Flagranti, Cosmic Disco, Daniele Baldelli. 116-120 BPM.",
      },
    ],
  },
  {
    id: "uk-garage-throwback",
    name: "UK Garage Throwback",
    vibe: "garage",
    sections: [
      {
        duration_min: 10,
        prompt:
          "2-step warmup, smooth and soulful. MJ Cole, Sunship, Wookie. 130-134 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Bumpy garage peak, classic UKG. Artful Dodger, Todd Edwards, El-B. 132-138 BPM.",
      },
      {
        duration_min: 10,
        prompt:
          "Dub garage close, basement vibes. Horsepower Productions, Ghost. 130-134 BPM.",
      },
    ],
  },
  {
    id: "liquid-dnb",
    name: "Liquid DnB",
    vibe: "drum-and-bass",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Liquid opener, jazzy and warm. Calibre, Marcus Intalex, Lenzman. 170-174 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Rolling peak, atmospheric drum & bass. London Elektricity, High Contrast, Logistics. 172-176 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Jungle close, breakbeat madness. Goldie, Photek, LTJ Bukem. 168-172 BPM.",
      },
    ],
  },
  {
    id: "electro-breakbeat",
    name: "Electro Breakbeat",
    vibe: "electro",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Synth warmup, melodic electro. DMX Krew, Carl Finlow, Drexciya. 124-128 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Electro peak, bassline driven. Helena Hauff, Cylob, I-F. 130-134 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Bassline close, breakbeat slammers. Posthuman, Dexter. 128-132 BPM.",
      },
    ],
  },
  {
    id: "festival-big-room-techno",
    name: "Festival Big Room Techno",
    vibe: "techno",
    sections: [
      {
        duration_min: 25,
        prompt:
          "Driving warmup, big sound. Kevin de Vries, Anfisa Letyago, FJAAK. 128-132 BPM.",
      },
      {
        duration_min: 40,
        prompt:
          "Big room peak, festival energy. ANNA, Reinier Zonneveld, I Hate Models. 134-140 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "After-hours close, melodic techno cool down. Tale Of Us, Adriatique, Mathame. 124-128 BPM.",
      },
    ],
  },
  {
    id: "indie-dance-nu-disco",
    name: "Indie Dance / Nu Disco",
    vibe: "indie-dance",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Disco warmup, indie dance. Justice, SebastiAn, Mr. Oizo. 118-122 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Groovy peak, nu disco anthems. Aeroplane, Breakbot, Yuksek. 122-126 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Blissful close, melodic and warm. Tensnake, Joakim, Joris Voorn. 118-122 BPM.",
      },
    ],
  },
  {
    id: "tech-house-party",
    name: "Tech House Party",
    vibe: "tech-house",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Funky warmup, vocal samples. Cloonee, Chris Stussy, James Hype. 124-126 BPM.",
      },
      {
        duration_min: 35,
        prompt:
          "Bouncy peak, festival tech house. Fisher, Chris Lake, John Summit. 126-128 BPM.",
      },
      {
        duration_min: 20,
        prompt:
          "Vocal close, sleazy and groovy. Hot Since 82, Loco Dice, Martin Ikin. 124-126 BPM.",
      },
    ],
  },
  {
    id: "dark-techno",
    name: "Dark Techno",
    vibe: "techno",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Sinister warmup, paranoid pads. Phase Fatale, Headless Horseman. 132-136 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Industrial peak, hard and hypnotic. Ancient Methods, Surgeon, Regis. 138-142 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Broken close, doom techno. Vatican Shadow, Prurient. 134-138 BPM.",
      },
    ],
  },
  {
    id: "cinematic-melodic-techno",
    name: "Cinematic Melodic Techno",
    vibe: "melodic-techno",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Atmospheric opener, deep and patient. Tale Of Us, Mind Against, Mathame. 122-124 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Building tension, dark melodic. Boris Brejcha, Massano, Ann Clue. 126-130 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Emotional drop, big melodic moments. Maceo Plex, Adriatique, Innellea. 128-132 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Ambient close, dreamy and slow. Yotto, Ben Böhmer, Kasper Bjørke. 116-122 BPM.",
      },
    ],
  },
  {
    id: "bass-house-smackdown",
    name: "Bass House Smackdown",
    vibe: "bass-house",
    sections: [
      {
        duration_min: 10,
        prompt:
          "Chunky warmup, garage-tinged bass. Will Clarke, Solardo. 124-126 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Drop heavy peak, festival bass house. Wax Motif, Westend, AC Slater. 128-132 BPM.",
      },
      {
        duration_min: 10,
        prompt:
          "Late vibes, dirty bassline. Chris Lorenzo, Notion. 126-128 BPM.",
      },
    ],
  },
  {
    id: "afro-house",
    name: "Afro House",
    vibe: "afro-house",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Percussive warmup, organic and rhythmic. Black Coffee, Themba, Da Capo. 118-122 BPM.",
      },
      {
        duration_min: 35,
        prompt:
          "Vocal Afro peak, soulful and tribal. &ME, Rampa, Adam Port. 122-126 BPM.",
      },
      {
        duration_min: 20,
        prompt:
          "Rhythmic close, Afro house classics. Caiiro, Vanco, Enoo Napa. 118-122 BPM.",
      },
    ],
  },
  {
    id: "disco-edits-loops",
    name: "Disco Edits & Loops",
    vibe: "disco",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Vintage warmup, classic disco. Giorgio Moroder, Donna Summer, Sister Sledge edits. 110-115 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Loopy peak, disco re-edits. Dimitri From Paris, Greg Wilson, Eddie C. 118-122 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Strings close, lush and melodic. Theo Parrish, Moodymann edits. 115-120 BPM.",
      },
    ],
  },
  {
    id: "hardcore-throwback",
    name: "90s Hardcore Throwback",
    vibe: "hardcore",
    sections: [
      {
        duration_min: 10,
        prompt:
          "Soft hardcore warmup, classic break. Hellfish, DJ Producer. 160-170 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "180 BPM peak, gabber madness. Angerfist, Endymion, Neophyte. 180-195 BPM.",
      },
      {
        duration_min: 10,
        prompt:
          "Broken close, breakcore frenzy. Venetian Snares, Aphex Twin. 160-180 BPM.",
      },
    ],
  },
  {
    id: "dub-techno-all-night",
    name: "Dub Techno All Night",
    vibe: "dub-techno",
    sections: [
      {
        duration_min: 25,
        prompt:
          "Atmospheric warmup, beatless dub textures. Gas, Wolfgang Voigt. 90-110 BPM. Slowly building rhythm.",
      },
      {
        duration_min: 40,
        prompt:
          "Dub techno peak, looping bliss. Basic Channel, Echocord, Deepchord. 120-126 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Minimal close, sparse dub. Pole, Vainqueur, Quantec. 118-122 BPM.",
      },
    ],
  },
  {
    id: "funky-house-friday",
    name: "Funky House Friday",
    vibe: "house",
    sections: [
      {
        duration_min: 15,
        prompt:
          "Funky warmup, disco samples. DJ Sneak, Mark Knight, Saison. 122-124 BPM.",
      },
      {
        duration_min: 30,
        prompt:
          "Vocal peak, classic funky house. Ferreck Dawn, Sandy Rivera, Eli & Fur. 124-128 BPM.",
      },
      {
        duration_min: 15,
        prompt:
          "Late jam, funky disco-house. Soulwax, Miguel Migs, Mousse T. 122-124 BPM.",
      },
    ],
  },
  {
    id: "90s-rave-classics",
    name: "90s Rave Classics",
    vibe: "rave",
    sections: [
      {
        duration_min: 15,
        prompt:
          "90s warmup, classic rave. Joey Beltram, Frankie Bones. 130-135 BPM.",
      },
      {
        duration_min: 35,
        prompt:
          "Rave peak, hardcore and breakbeat. The Prodigy, Altern 8, SL2. 135-145 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Anthem close, classic rave anthems. Orbital, Underworld, Leftfield. 130-138 BPM.",
      },
    ],
  },
  {
    id: "psytrance-forest",
    name: "Psytrance Forest",
    vibe: "psytrance",
    sections: [
      {
        duration_min: 20,
        prompt:
          "Psychedelic warmup, ambient psy. Ott, Shpongle, Carbon Based Lifeforms. 95-115 BPM.",
      },
      {
        duration_min: 45,
        prompt:
          "Progressive psy peak, full-on. Astrix, Vini Vici, Ace Ventura. 138-145 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Forest close, downtempo psybient. Entheogenic, Asura. 110-120 BPM.",
      },
    ],
  },
  {
    id: "downtempo-trip-hop",
    name: "Downtempo Trip Hop",
    vibe: "downtempo",
    sections: [
      {
        duration_min: 10,
        prompt:
          "Ambient opener, slow and atmospheric. Bonobo, Tycho, Helios. 90-95 BPM.",
      },
      {
        duration_min: 25,
        prompt:
          "Trip hop peak, classic Bristol sound. Massive Attack, Portishead, Tricky. 90-100 BPM.",
      },
      {
        duration_min: 10,
        prompt:
          "Downtempo close, late night vibes. DJ Krush, Kruder & Dorfmeister. 85-95 BPM.",
      },
    ],
  },
];

export function pickRandomPromptSet(excludeId?: string): PromptSet {
  const pool = excludeId
    ? PROMPT_SETS.filter((s) => s.id !== excludeId)
    : PROMPT_SETS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Random poetic name generator ─────────────────────────────────────────
// Used by the randomize button so each pick gets a fresh playlist label.

const NAME_ADJECTIVES = [
  "Hazy", "Velvet", "Neon", "Dusk", "Dawn", "Foggy", "Midnight", "Electric",
  "Cosmic", "Late", "Deep", "Raw", "Tribal", "Steel", "Broken", "Lush",
  "Sunrise", "Tropical", "Hyper", "Glacial", "Smoky", "Dirty", "Nocturnal",
  "Golden", "Copper", "Crimson", "Static", "Liquid", "Ferric", "Phantom",
  "Subtle", "Loose", "Tight", "Crystal", "Acidic", "Saturated", "Marble",
  "Pulse", "Vacant", "Soft", "Iron", "Echo", "Amber", "Cobalt",
];

const NAME_NOUNS = [
  "Drift", "Voyage", "Ritual", "Current", "Basement", "Terrace", "Dispatch",
  "Transmission", "Cycle", "Cut", "Edge", "Room", "Hour", "Loop", "Frame",
  "Channel", "Forecast", "Outpost", "Bloom", "Tape", "Reel", "Echo",
  "Quarter", "Slot", "Bunker", "Garden", "Tunnel", "Lift", "Tower",
  "Reservoir", "Atlas", "Pulse", "Wire", "Vault", "Theater", "Carrier",
];

const NAME_SUFFIXES = [
  "Set", "Mix", "Tape", "Hour", "Block", "Cut", "Sketch", "Dispatch", "Edit",
];

export function randomPoeticName(): string {
  const a = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const n = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  const s = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  return `${a} ${n} ${s}`;
}
