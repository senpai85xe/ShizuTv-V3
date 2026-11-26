import { GENRE_CARD_STYLES, GenreCardStyle } from '../data/themePresets';
import {
  ANIME_TAG_SPOTLIGHTS,
  EXTRA_TAG_ICON_POOL,
  MANGA_GENRE_SPOTLIGHTS,
  MANGA_TAG_SPOTLIGHTS,
  TAG_ICON_BY_NAME,
} from '../data/discoverSpotlightData';

export type GenreIconId =
  | 'swords'
  | 'compass'
  | 'moonStar'
  | 'comedyFace'
  | 'coffee'
  | 'dualHearts'
  | 'drama'
  | 'detective'
  | 'pulseWatch'
  | 'flame'
  | 'ninja'
  | 'haremRings'
  | 'rocket'
  | 'skull'
  | 'brain'
  | 'trophy'
  | 'bot'
  | 'music'
  | 'flameHeart'
  | 'wand'
  | 'tag'
  | 'tagGlobe'
  | 'tagRefresh'
  | 'tagSparkles'
  | 'tagGradCap'
  | 'tagClock'
  | 'tagCpu'
  | 'tagGhost'
  | 'tagDroplet'
  | 'tagBiohazard'
  | 'tagSword'
  | 'tagZap'
  | 'tagLandmark'
  | 'tagCrosshair'
  | 'tagTrendingUp'
  | 'tagShield'
  | 'tagFlower'
  | 'tagGem'
  | 'tagHeartHandshake'
  | 'tagTent'
  | 'tagEyeOff'
  | 'tagBuilding'
  | 'tagOrbit'
  | 'tagSyringe'
  | 'tagCloudRain'
  | 'tagInfinity'
  | 'tagSprout'
  | 'tagCastle'
  | 'tagGamepad'
  | 'tagScroll'
  | 'tagRadar'
  | 'tagCog'
  | 'tagBriefcase'
  | 'tagCoins'
  | 'tagScale'
  | 'tagHelp'
  | 'tagCrown'
  | 'tagSun'
  | 'tagFeather'
  | 'tagFlask'
  | 'tagBone'
  | 'tagSearch'
  | 'tagLaugh'
  | 'tagQuote'
  | 'tagSmile'
  | 'tagUtensils'
  | 'tagLaptop'
  | 'tagHome'
  | 'tagSunrise'
  | 'tagMic'
  | 'tagGuitar'
  | 'tagCircleDot'
  | 'tagMedal'
  | 'tagFlag'
  | 'tagDumbbell'
  | 'tagTarget'
  | 'tagEye'
  | 'tagVenetianMask'
  | 'tagBookMarked'
  | 'tagAnchor'
  | 'tagAtom'
  | 'tagBinoculars'
  | 'tagKeyRound'
  | 'tagLightbulb'
  | 'tagMountain'
  | 'tagMapPin'
  | 'tagPawPrint';

export type DiscoverCategorySection = 'genres' | 'worlds';
export type DiscoverCategorySort = 'suggested' | 'az' | 'popular';
export type DiscoverCategoryViewMode = 'grid' | 'list';

export interface GenreCategoryDescriptor {
  id: string;
  label: string;
  iconId: GenreIconId;
  gradientFrom: string;
  gradientTo: string;
  tagline: string;
  seriesCount: string;
  numericCount: number;
  covers: [string, string, string];
  section: DiscoverCategorySection;
  filterKind: 'genre' | 'tag';
  filterValues: string[];
  order: number;
}

export interface DiscoverCategoryGroup {
  id: 'genres' | 'worlds' | 'all' | 'tags';
  title?: string;
  items: GenreCategoryDescriptor[];
}

export const DEFAULT_GENRE_CARD_STYLE: GenreCardStyle = 'showcase';

const VALID_GENRE_CARD_STYLES = new Set<string>(GENRE_CARD_STYLES.map((s) => s.id));

export function resolveGenreCardStyle(style?: string | null): GenreCardStyle {
  if (style && VALID_GENRE_CARD_STYLES.has(style)) {
    return style as GenreCardStyle;
  }
  return DEFAULT_GENRE_CARD_STYLE;
}

export function getGenreCardStyleName(styleId?: string | null): string {
  const resolved = resolveGenreCardStyle(styleId);
  return GENRE_CARD_STYLES.find((s) => s.id === resolved)?.name ?? resolved;
}

export function getGenreCardStyleDescription(styleId?: string | null): string {
  const resolved = resolveGenreCardStyle(styleId);
  return GENRE_CARD_STYLES.find((s) => s.id === resolved)?.description ?? '';
}

const ANILIST_COVER_BASE = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/';

function cover(file: string): string {
  return `${ANILIST_COVER_BASE}${file}`;
}

export const CURATED_GENRE_CATEGORIES: ReadonlyArray<GenreCategoryDescriptor> = [
  // GENRES section (exact Figma top 9 order + additional AniList genres)
  {
    id: 'action',
    label: 'Action',
    iconId: 'swords',
    gradientFrom: '#E11D1D',
    gradientTo: '#7A0C0C',
    tagline: 'Fights, chases and heroes who refuse to stay down',
    seriesCount: '5,372',
    numericCount: 5372,
    covers: [
      cover('bx21-ELSYx3yMPcKM.jpg'),
      cover('bx21459-nYh85uj2Fuwr.jpg'),
      cover('bx113415-LHBAeoZDIsnF.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Action'],
    order: 1,
  },
  {
    id: 'adventure',
    label: 'Adventure',
    iconId: 'compass',
    gradientFrom: '#047857',
    gradientTo: '#064E3B',
    tagline: 'Quests, journeys and the long road to somewhere new',
    seriesCount: '2,112',
    numericCount: 2112,
    covers: [
      cover('bx21-ELSYx3yMPcKM.jpg'),
      cover('bx101922-WBsBl0ClmgYL.jpg'),
      cover('bx11061-y5gsT1hoHuHw.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Adventure'],
    order: 2,
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    iconId: 'moonStar',
    gradientFrom: '#7C3AED',
    gradientTo: '#4C1D95',
    tagline: 'Magic, myth and worlds that run on their own rules.',
    seriesCount: '5,372',
    numericCount: 5372,
    covers: [
      cover('bx16498-buvcRTBx4NSm.jpg'),
      cover('bx101922-WBsBl0ClmgYL.jpg'),
      cover('bx11061-y5gsT1hoHuHw.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Fantasy'],
    order: 3,
  },
  {
    id: 'comedy',
    label: 'Comedy',
    iconId: 'comedyFace',
    gradientFrom: '#D97706',
    gradientTo: '#78350F',
    tagline: 'Stories built to make you laugh out loud.',
    seriesCount: '3,746',
    numericCount: 3746,
    covers: [
      cover('bx21459-nYh85uj2Fuwr.jpg'),
      cover('bx21087-B5DHjqZ3kW4b.jpg'),
      cover('bx21-ELSYx3yMPcKM.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Comedy'],
    order: 4,
  },
  {
    id: 'slice-of-life',
    label: 'Slice of life',
    iconId: 'coffee',
    gradientFrom: '#65A30D',
    gradientTo: '#365314',
    tagline: 'Ordinary days told with warmth and small joys.',
    seriesCount: '1,740',
    numericCount: 1740,
    covers: [
      cover('bx20954-sYRfE5jQRtSB.jpg'),
      cover('bx21507-6YUSbh2m0N1p.jpg'),
      cover('bx20665-TLgkL8T8IRFd.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Slice of Life'],
    order: 5,
  },
  {
    id: 'romance',
    label: 'Romance',
    iconId: 'dualHearts',
    gradientFrom: '#DB2777',
    gradientTo: '#831843',
    tagline: 'Falling in love, slowly or all at once.',
    seriesCount: '1,560',
    numericCount: 1560,
    covers: [
      cover('bx20954-sYRfE5jQRtSB.jpg'),
      cover('bx11757-SxYDUzdr9rh2.jpg'),
      cover('bx21519-SUo3ZQuCbYhJ.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Romance'],
    order: 6,
  },
  {
    id: 'drama',
    label: 'Drama',
    iconId: 'drama',
    gradientFrom: '#EA580C',
    gradientTo: '#7C2D12',
    tagline: 'Big feelings, hard choices and people under pressure.',
    seriesCount: '1,863',
    numericCount: 1863,
    covers: [
      cover('bx16498-buvcRTBx4NSm.jpg'),
      cover('bx101922-WBsBl0ClmgYL.jpg'),
      cover('bx113415-LHBAeoZDIsnF.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Drama'],
    order: 7,
  },
  {
    id: 'mystery',
    label: 'Mystery',
    iconId: 'detective',
    gradientFrom: '#4338CA',
    gradientTo: '#262066',
    tagline: 'Clues, secrets and a truth waiting to be found.',
    seriesCount: '720',
    numericCount: 720,
    covers: [
      cover('bx16498-buvcRTBx4NSm.jpg'),
      cover('bx1535-kUgkcrfOrkUM.jpg'),
      cover('b20605-k665mVkSug8D.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Mystery'],
    order: 8,
  },
  {
    id: 'thriller',
    label: 'Thriller',
    iconId: 'pulseWatch',
    gradientFrom: '#E11D48',
    gradientTo: '#881337',
    tagline: 'Tension that tightens until the very last page.',
    seriesCount: '347',
    numericCount: 347,
    covers: [
      cover('bx1535-kUgkcrfOrkUM.jpg'),
      cover('bx101759-8UR7r9MNVpz2.jpg'),
      cover('bx21355-wRVUrGxpvIQQ.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Thriller'],
    order: 9,
  },
  {
    id: 'horror',
    label: 'Horror',
    iconId: 'skull',
    gradientFrom: '#991B1B',
    gradientTo: '#450A0A',
    tagline: 'Chilling dread, survival nightmares and the uncanny.',
    seriesCount: '612',
    numericCount: 612,
    covers: [
      cover('b20605-k665mVkSug8D.jpg'),
      cover('bx127230-DdP4vAdssLoz.png'),
      cover('bx101759-8UR7r9MNVpz2.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Horror'],
    order: 10,
  },
  {
    id: 'psychological',
    label: 'Psychological',
    iconId: 'brain',
    gradientFrom: '#4F46E5',
    gradientTo: '#1E1B4B',
    tagline: 'Mind games, fractured psyches and moral labyrinths.',
    seriesCount: '548',
    numericCount: 548,
    covers: [
      cover('bx1535-kUgkcrfOrkUM.jpg'),
      cover('b20605-k665mVkSug8D.jpg'),
      cover('bx101759-8UR7r9MNVpz2.jpg'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Psychological'],
    order: 11,
  },
  {
    id: 'sports',
    label: 'Sports',
    iconId: 'trophy',
    gradientFrom: '#0D9488',
    gradientTo: '#115E59',
    tagline: 'Rivalries, training arcs and championship glory.',
    seriesCount: '894',
    numericCount: 894,
    covers: [
      cover('bx20464-ooZUyBe4ptp9.png'),
      cover('bx20992-aHgNbcalVEqk.png'),
      cover('bx21698-RL71mr1YU5Io.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Sports'],
    order: 12,
  },
  {
    id: 'music',
    label: 'Music',
    iconId: 'music',
    gradientFrom: '#C026D3',
    gradientTo: '#701A75',
    tagline: 'Bands, idols and melodies that carry every emotion.',
    seriesCount: '734',
    numericCount: 734,
    covers: [
      cover('bx20665-TLgkL8T8IRFd.png'),
      cover('bx5680-r3AI3Cwfv0Aq.png'),
      cover('bx130003-HTDmeL4RGeJ4.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Music'],
    order: 13,
  },
  {
    id: 'ecchi',
    label: 'Ecchi',
    iconId: 'flameHeart',
    gradientFrom: '#F43F5E',
    gradientTo: '#881337',
    tagline: 'Playful fanservice, bold comedy and mischievous sparks.',
    seriesCount: '912',
    numericCount: 912,
    covers: [
      cover('b19815-sEOQ9yQaPKlk.jpg'),
      cover('bx20789-Ma5ouSYPkru9.jpg'),
      cover('bx21202-mPOr80AEjUcZ.png'),
    ],
    section: 'genres',
    filterKind: 'genre',
    filterValues: ['Ecchi'],
    order: 14,
  },

  // WORLDS AND SETTING section (exact Figma 3 first: Supernatural, Martial art, Harem, then Sci-Fi, Mecha, Mahou Shoujo)
  {
    id: 'supernatural',
    label: 'Supernatural',
    iconId: 'flame',
    gradientFrom: '#9333EA',
    gradientTo: '#581C87',
    tagline: 'Ghosts, spirits and powers beyond the everyday.',
    seriesCount: '1,302',
    numericCount: 1302,
    covers: [
      cover('bx101922-WBsBl0ClmgYL.jpg'),
      cover('bx113415-LHBAeoZDIsnF.jpg'),
      cover('bx1535-kUgkcrfOrkUM.jpg'),
    ],
    section: 'worlds',
    filterKind: 'genre',
    filterValues: ['Supernatural'],
    order: 101,
  },
  {
    id: 'martial-art',
    label: 'Martial art',
    iconId: 'ninja',
    gradientFrom: '#C2410C',
    gradientTo: '#7C2D12',
    tagline: 'Masters, rivals and the discipline of the fist.',
    seriesCount: '721',
    numericCount: 721,
    covers: [
      cover('bx21-ELSYx3yMPcKM.jpg'),
      cover('bx101922-WBsBl0ClmgYL.jpg'),
      cover('bx11061-y5gsT1hoHuHw.png'),
    ],
    section: 'worlds',
    filterKind: 'tag',
    filterValues: ['Martial Arts'],
    order: 102,
  },
  {
    id: 'harem',
    label: 'Harem',
    iconId: 'haremRings',
    gradientFrom: '#BE185D',
    gradientTo: '#701A3B',
    tagline: 'One lead, many hearts and a lot of complications.',
    seriesCount: '301',
    numericCount: 301,
    covers: [
      cover('b19815-sEOQ9yQaPKlk.jpg'),
      cover('bx20789-Ma5ouSYPkru9.jpg'),
      cover('bx21202-mPOr80AEjUcZ.png'),
    ],
    section: 'worlds',
    filterKind: 'tag',
    filterValues: ['Male Harem'],
    order: 103,
  },
  {
    id: 'sci-fi',
    label: 'Sci-Fi',
    iconId: 'rocket',
    gradientFrom: '#0284C7',
    gradientTo: '#075985',
    tagline: 'Space frontiers, cybernetic futures and time paradoxes.',
    seriesCount: '2,418',
    numericCount: 2418,
    covers: [
      cover('bx21087-B5DHjqZ3kW4b.jpg'),
      cover('bx9253-tIUXF2gfU8Sg.jpg'),
      cover('bx105333-GybuoSoOZfpH.jpg'),
    ],
    section: 'worlds',
    filterKind: 'genre',
    filterValues: ['Sci-Fi'],
    order: 104,
  },
  {
    id: 'mecha',
    label: 'Mecha',
    iconId: 'bot',
    gradientFrom: '#2563EB',
    gradientTo: '#1E3A8A',
    tagline: 'Giant machines, ace pilots and orbital conflicts.',
    seriesCount: '986',
    numericCount: 986,
    covers: [
      cover('bx1575-hsmWM2ydNm1m.jpg'),
      cover('nx99423-8MBxtwCeHf8B.png'),
      cover('bx30-AI1zr74Dh4ye.jpg'),
    ],
    section: 'worlds',
    filterKind: 'genre',
    filterValues: ['Mecha'],
    order: 105,
  },
  {
    id: 'mahou-shoujo',
    label: 'Mahou Shoujo',
    iconId: 'wand',
    gradientFrom: '#EC4899',
    gradientTo: '#831843',
    tagline: 'Starlight transformations, cosmic vows and courage.',
    seriesCount: '418',
    numericCount: 418,
    covers: [
      cover('bx9756-QnUGwlwwnsuN.jpg'),
      cover('b11981-koz1IoISs3eU.jpg'),
      cover('bx530-O8q6KpJ244Qk.jpg'),
    ],
    section: 'worlds',
    filterKind: 'genre',
    filterValues: ['Mahou Shoujo'],
    order: 106,
  },
];

const CURATED_BY_FILTER_KEY = new Map<string, GenreCategoryDescriptor>();
const CURATED_BY_ID = new Map<string, GenreCategoryDescriptor>();
for (const entry of CURATED_GENRE_CATEGORIES) {
  CURATED_BY_ID.set(entry.id.toLowerCase(), entry);
  for (const val of entry.filterValues) {
    CURATED_BY_FILTER_KEY.set(val.toLowerCase(), entry);
  }
  CURATED_BY_FILTER_KEY.set(entry.label.toLowerCase(), entry);
}

const FALLBACK_PALETTES: ReadonlyArray<{
  from: string;
  to: string;
  iconId: GenreIconId;
}> = [
  { from: '#E11D1D', to: '#7A0C0C', iconId: 'swords' },
  { from: '#047857', to: '#064E3B', iconId: 'compass' },
  { from: '#7C3AED', to: '#4C1D95', iconId: 'moonStar' },
  { from: '#D97706', to: '#78350F', iconId: 'flame' },
  { from: '#0284C7', to: '#075985', iconId: 'rocket' },
  { from: '#DB2777', to: '#831843', iconId: 'dualHearts' },
  { from: '#4338CA', to: '#262066', iconId: 'detective' },
  { from: '#0D9488', to: '#115E59', iconId: 'trophy' },
];

const FALLBACK_COVER_POOL: ReadonlyArray<[string, string, string]> = [
  [cover('bx21-ELSYx3yMPcKM.jpg'), cover('bx21459-nYh85uj2Fuwr.jpg'), cover('bx113415-LHBAeoZDIsnF.jpg')],
  [cover('bx16498-buvcRTBx4NSm.jpg'), cover('bx101922-WBsBl0ClmgYL.jpg'), cover('bx11061-y5gsT1hoHuHw.png')],
  [cover('bx20954-sYRfE5jQRtSB.jpg'), cover('bx21507-6YUSbh2m0N1p.jpg'), cover('bx20665-TLgkL8T8IRFd.png')],
  [cover('bx1535-kUgkcrfOrkUM.jpg'), cover('b20605-k665mVkSug8D.jpg'), cover('bx101759-8UR7r9MNVpz2.jpg')],
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export const POPULAR_ANILIST_TAGS: ReadonlyArray<string> = [
  'Isekai',
  'Martial Arts',
  'Reincarnation',
  'Magic',
  'School',
  'Time Manipulation',
  'Cyberpunk',
  'Demons',
  'Vampire',
  'Post-Apocalyptic',
  'Swordplay',
  'Super Power',
  'Historical',
  'Military',
  'Shounen',
  'Seinen',
  'Shoujo',
  'Josei',
  'Male Harem',
  'Female Harem',
  'Survival',
  'Anti-Hero',
  'Urban Fantasy',
  'Space',
  'Gore',
  'Tragedy',
  'Time Loop',
  'Cultivation',
  'Dungeon',
  'Video Games',
  'Samurai',
  'Aliens',
  'Robots',
  'Yakuza',
  'Mafia',
  'Revenge',
  'Amnesia',
  'Dragons',
  'Gods',
  'Angels',
  'Witch',
  'Zombie',
  'Detective',
  'Parody',
  'Satire',
  'Slapstick',
  'Food',
  'Work',
  'Family Life',
  'Coming of Age',
  'Idol',
  'Band',
  'Baseball',
  'Basketball',
  'Football',
  'Boxing',
  'Battle Royale',
  'Espionage',
  'Assassins',
  'Mythology',
];

const CURATED_GENRE_NAMES_LOWER = new Set<string>(
  CURATED_GENRE_CATEGORIES.flatMap((c) => [
    c.label.toLowerCase(),
    ...c.filterValues.map((v) => v.toLowerCase()),
  ]),
);

export const DEFAULT_DISCOVER_GENRES: ReadonlyArray<string> = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

const MANGA_COVER_BASE = 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/';

function mangaCover(file: string): string {
  return `${MANGA_COVER_BASE}${file}`;
}

const FALLBACK_MANGA_COVER_POOL: ReadonlyArray<[string, string, string]> = [
  [mangaCover('bx105778-euxXZEIfDY2u.png'), mangaCover('bx105398-b673Vt5ZSuz3.jpg'), mangaCover('bx101517-H3TdM3g5ZUe9.jpg')],
  [mangaCover('bx30002-Cul4OeN7bYtn.jpg'), mangaCover('bx30013-BeslEMqiPhlk.jpg'), mangaCover('bx87216-c9bSNVD10UuD.png')],
  [mangaCover('bx85135-11OOnyaqV71k.png'), mangaCover('bx140475-QEGtrmdvbpOv.jpg'), mangaCover('bx107237-tyQXghsKmE0t.jpg')],
  [mangaCover('bx54705-78Th5SRaL0Ns.png'), mangaCover('nx100230-TA0RQ9d7RVas.jpg'), mangaCover('bx86218-sIl9tnqHZQyh.jpg')],
];

function resolveTagIconId(name: string, hash: number): GenreIconId {
  const exact = TAG_ICON_BY_NAME[name];
  if (exact) return exact as GenreIconId;
  const lower = name.trim().toLowerCase();
  for (const [key, icon] of Object.entries(TAG_ICON_BY_NAME)) {
    if (key.toLowerCase() === lower) return icon as GenreIconId;
  }
  return EXTRA_TAG_ICON_POOL[hash % EXTRA_TAG_ICON_POOL.length] as GenreIconId;
}

function applyMediaVariantToCurated(
  entry: GenreCategoryDescriptor,
  mediaType: 'ANIME' | 'MANGA',
): GenreCategoryDescriptor {
  if (mediaType !== 'MANGA') return entry;
  const primaryKey = entry.filterValues[0] || entry.label;
  const mangaMeta = MANGA_GENRE_SPOTLIGHTS[primaryKey] ?? MANGA_GENRE_SPOTLIGHTS[entry.label];
  if (!mangaMeta) return entry;
  return {
    ...entry,
    numericCount: mangaMeta.count,
    seriesCount: mangaMeta.count.toLocaleString('en-US'),
    covers: mangaMeta.covers,
  };
}

export function getGenreCategoryDescriptor(
  name: string,
  filterKind: 'genre' | 'tag' = 'genre',
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
): GenreCategoryDescriptor {
  const existing = CURATED_BY_FILTER_KEY.get(name.trim().toLowerCase());
  if (existing && (filterKind === 'genre' || existing.filterKind === 'tag')) {
    return applyMediaVariantToCurated(existing, mediaType);
  }

  const h = hashName(name);
  const palette = FALLBACK_PALETTES[h % FALLBACK_PALETTES.length];
  const tagSpotlights = mediaType === 'MANGA' ? MANGA_TAG_SPOTLIGHTS : ANIME_TAG_SPOTLIGHTS;
  const spotlight = filterKind === 'tag' ? tagSpotlights[name] : undefined;
  const fallbackPool = mediaType === 'MANGA' ? FALLBACK_MANGA_COVER_POOL : FALLBACK_COVER_POOL;
  const covers = spotlight?.covers ?? fallbackPool[h % fallbackPool.length];
  const pseudoCount =
    spotlight?.count ??
    (mediaType === 'MANGA' ? 185 + ((h * 7) % 1420) : 120 + (h % 980));

  return {
    id: `${filterKind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: name,
    iconId: filterKind === 'tag' ? resolveTagIconId(name, h) : palette.iconId,
    gradientFrom: palette.from,
    gradientTo: palette.to,
    tagline:
      filterKind === 'tag'
        ? `Curated ${name.toLowerCase()} ${mediaType === 'MANGA' ? 'manga' : 'anime'} picked for this theme.`
        : `Explore top-rated ${name.toLowerCase()} ${mediaType === 'MANGA' ? 'manga' : 'anime'}.`,
    seriesCount: pseudoCount.toLocaleString('en-US'),
    numericCount: pseudoCount,
    covers,
    section: 'genres',
    filterKind,
    filterValues: [name],
    order: 500 + (h % 500),
  };
}

export function buildDiscoverCategoryGroups(params: {
  browseTab: 'genres' | 'tags';
  genresList: string[];
  tagsList: string[];
  categoryQuery: string;
  categorySort: DiscoverCategorySort;
  mediaType?: 'ANIME' | 'MANGA';
}): DiscoverCategoryGroup[] {
  const query = params.categoryQuery.trim().toLowerCase();
  const activeMediaType: 'ANIME' | 'MANGA' = params.mediaType === 'MANGA' ? 'MANGA' : 'ANIME';

  let items: GenreCategoryDescriptor[];
  if (params.browseTab === 'tags') {
    const blockedGenreNames = new Set<string>(CURATED_GENRE_NAMES_LOWER);
    for (const g of params.genresList) {
      if (g) blockedGenreNames.add(g.trim().toLowerCase());
    }
    const seenTags = new Set<string>();
    items = [];
    for (const tagName of params.tagsList) {
      const clean = tagName?.trim();
      const lower = clean?.toLowerCase();
      if (!clean || !lower || lower === 'hentai' || blockedGenreNames.has(lower) || seenTags.has(lower)) {
        continue;
      }
      seenTags.add(lower);
      const desc = getGenreCategoryDescriptor(clean, 'tag', activeMediaType);
      items.push({
        ...desc,
        order: items.length + 1,
      });
    }
  } else {
    const byId = new Map<string, GenreCategoryDescriptor>();
    for (const curated of CURATED_GENRE_CATEGORIES) {
      byId.set(curated.id, applyMediaVariantToCurated(curated, activeMediaType));
    }
    for (const rawGenre of params.genresList) {
      if (!rawGenre || rawGenre.trim().toLowerCase() === 'hentai') continue;
      const desc = getGenreCategoryDescriptor(rawGenre, 'genre', activeMediaType);
      if (!byId.has(desc.id)) {
        byId.set(desc.id, desc);
      }
    }
    items = Array.from(byId.values());
  }

  if (query) {
    items = items.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.tagline.toLowerCase().includes(query) ||
        item.filterValues.some((v) => v.toLowerCase().includes(query)),
    );
  }

  if (params.categorySort === 'az') {
    const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label));
    return [
      {
        id: params.browseTab === 'tags' ? 'tags' : 'all',
        title: params.browseTab === 'tags' ? 'ALL TAGS (A TO Z)' : 'ALL CATEGORIES (A TO Z)',
        items: sorted,
      },
    ];
  }

  if (params.categorySort === 'popular') {
    const sorted = [...items].sort((a, b) => b.numericCount - a.numericCount);
    return [
      {
        id: params.browseTab === 'tags' ? 'tags' : 'all',
        title: params.browseTab === 'tags' ? 'MOST POPULAR TAGS' : 'MOST POPULAR CATEGORIES',
        items: sorted,
      },
    ];
  }

  if (params.browseTab === 'tags' || query) {
    return [
      {
        id: params.browseTab === 'tags' ? 'tags' : 'all',
        title: query
          ? `MATCHING CATEGORIES (${items.length})`
          : `POPULAR TAGS (${items.length})`,
        items,
      },
    ];
  }

  const genresGroup = items
    .filter((i) => i.section === 'genres')
    .sort((a, b) => a.order - b.order);
  const worldsGroup = items
    .filter((i) => i.section === 'worlds')
    .sort((a, b) => a.order - b.order);

  const groups: DiscoverCategoryGroup[] = [];
  if (genresGroup.length > 0) {
    groups.push({ id: 'genres', title: 'GENRES', items: genresGroup });
  }
  if (worldsGroup.length > 0) {
    groups.push({ id: 'worlds', title: 'WORLDS AND SETTING', items: worldsGroup });
  }
  return groups;
}

export function countDiscoverCategoryItems(groups: ReadonlyArray<DiscoverCategoryGroup>): number {
  let total = 0;
  for (const g of groups) {
    total += g.items.length;
  }
  return total;
}

export function getDiscoverCategorySpotlightCount(
  mediaType: 'ANIME' | 'MANGA',
  genres: ReadonlyArray<string> = [],
  tags: ReadonlyArray<string> = [],
): number | null {
  if (genres.length === 1 && tags.length === 0) {
    const desc = getGenreCategoryDescriptor(genres[0], 'genre', mediaType);
    return Number.isFinite(desc.numericCount) && desc.numericCount > 0 ? desc.numericCount : null;
  }
  if (tags.length === 1 && genres.length === 0) {
    const desc = getGenreCategoryDescriptor(tags[0], 'tag', mediaType);
    return Number.isFinite(desc.numericCount) && desc.numericCount > 0 ? desc.numericCount : null;
  }
  return null;
}

export function getHomeBrowseGenres(
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
): GenreCategoryDescriptor[] {
  const activeMediaType: 'ANIME' | 'MANGA' = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  return [...CURATED_GENRE_CATEGORIES]
    .sort((a, b) => a.order - b.order)
    .map((entry) => applyMediaVariantToCurated(entry, activeMediaType));
}

export function buildHomeGenreDiscoverUrl(
  descriptor: GenreCategoryDescriptor,
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
): string {
  const activeMediaType: 'ANIME' | 'MANGA' = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  const params = new URLSearchParams();
  params.set('type', activeMediaType);
  if (descriptor.filterKind === 'tag') {
    params.set('tags', descriptor.filterValues.join(','));
  } else {
    params.set('genres', descriptor.filterValues.join(','));
  }
  return `/discover?${params.toString()}`;
}

export function buildGenreDetailUrl(
  descriptor: GenreCategoryDescriptor,
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
): string {
  const activeMediaType: 'ANIME' | 'MANGA' = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  const params = new URLSearchParams();
  params.set('type', activeMediaType);
  if (descriptor.filterKind === 'tag' && !CURATED_BY_ID.has(descriptor.id.toLowerCase())) {
    params.set('kind', 'tag');
    params.set('name', descriptor.filterValues[0] || descriptor.label);
  }
  return `/genre/${encodeURIComponent(descriptor.id)}?${params.toString()}`;
}

export function resolveGenreDescriptorFromRoute(
  genreId: string,
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
  kindParam?: string | null,
  nameParam?: string | null,
): GenreCategoryDescriptor {
  const activeMediaType: 'ANIME' | 'MANGA' = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  const normalizedId = decodeURIComponent(genreId || '').trim().toLowerCase();

  const byId = CURATED_BY_ID.get(normalizedId);
  if (byId) {
    return applyMediaVariantToCurated(byId, activeMediaType);
  }

  const explicitName = nameParam?.trim();
  if (explicitName) {
    const inferredKind: 'genre' | 'tag' = kindParam === 'tag' ? 'tag' : 'genre';
    return getGenreCategoryDescriptor(explicitName, inferredKind, activeMediaType);
  }

  const normalizedKey = normalizedId.replace(/^(genre|tag)-/, '');
  const byFilter = CURATED_BY_FILTER_KEY.get(normalizedKey.replace(/-/g, ' '));
  if (byFilter) {
    return applyMediaVariantToCurated(byFilter, activeMediaType);
  }

  const fallbackKind: 'genre' | 'tag' =
    kindParam === 'tag' || normalizedId.startsWith('tag-') ? 'tag' : 'genre';

  if (fallbackKind === 'tag') {
    const matchedTag = POPULAR_ANILIST_TAGS.find(
      (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-') === normalizedKey,
    );
    if (matchedTag) {
      return getGenreCategoryDescriptor(matchedTag, 'tag', activeMediaType);
    }
  }

  const matchedDefaultGenre = DEFAULT_DISCOVER_GENRES.find(
    (g) => g.toLowerCase().replace(/[^a-z0-9]+/g, '-') === normalizedKey,
  );
  if (matchedDefaultGenre) {
    return getGenreCategoryDescriptor(matchedDefaultGenre, 'genre', activeMediaType);
  }

  const titleCaseName = normalizedKey
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Action';

  return getGenreCategoryDescriptor(titleCaseName, fallbackKind, activeMediaType);
}



