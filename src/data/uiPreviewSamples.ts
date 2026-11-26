import { EpisodeChapterListItem } from '../components/EpisodeChapterList';
import { UnifiedMedia } from '../types/media';

export const PREVIEW_SAMPLE_MEDIA: UnifiedMedia = {
  id: '21',
  type: 'ANIME',
  title: {
    english: 'One Piece',
    romaji: 'ONE PIECE',
    native: 'ワンピース',
  },
  format: 'TV',
  year: 1999,
  score: 8.8,
  episodes: 1122,
  genres: ['Adventure', 'Action'],
  description:
    'Monkey D. Luffy sails across the Grand Line with his Straw Hat crew to claim the legendary One Piece.',
  cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
};

export const PREVIEW_SAMPLE_MANGA: UnifiedMedia = {
  id: '30013',
  type: 'MANGA',
  title: {
    english: 'One Piece',
    romaji: 'ONE PIECE',
    native: 'ワンピース',
  },
  format: 'MANGA',
  year: 1997,
  score: 9.1,
  chapters: 1130,
  genres: ['Adventure', 'Fantasy'],
  description:
    'Eiichiro Oda’s epic manga chronicling the voyages of Monkey D. Luffy and the Straw Hat Pirates.',
  cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-73IhOXpJZiMF.jpg',
  banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
};

export const PREVIEW_EPISODE_ITEMS: EpisodeChapterListItem[] = [
  {
    id: 'preview-ep-1',
    number: 1,
    title: 'The Battle Begins',
    meta: '1mo ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    isCurrent: true,
  },
  {
    id: 'preview-ep-2',
    number: 2,
    title: 'The Journey Begins',
    meta: '3w ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    isNew: true,
  },
  {
    id: 'preview-ep-3',
    number: 3,
    title: 'First Encounter',
    meta: '2w ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
  },
  {
    id: 'preview-ep-4',
    number: 4,
    title: 'Day of Atonement',
    meta: '1w ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  },
];

export const PREVIEW_CHAPTER_ITEMS: EpisodeChapterListItem[] = [
  {
    id: 'preview-ch-1',
    number: 1,
    title: 'Romance Dawn',
    meta: 'Official Release · 24 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    isCurrent: true,
  },
  {
    id: 'preview-ch-2',
    number: 2,
    title: 'They Call Him Straw Hat',
    meta: 'Official Release · 19 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    isNew: true,
  },
  {
    id: 'preview-ch-3',
    number: 3,
    title: 'Morgan vs. Luffy',
    meta: 'ShizuTv Scanlations · 20 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
  },
  {
    id: 'preview-ch-4',
    number: 4,
    title: 'The Pirate Captain',
    meta: 'ShizuTv Scanlations · 18 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  },
];

export const PREVIEW_HERO_MEDIA: UnifiedMedia[] = [
  PREVIEW_SAMPLE_MEDIA,
  {
    id: '1535',
    type: 'ANIME',
    title: {
      english: 'Death Note',
      romaji: 'DEATH NOTE',
    },
    format: 'TV',
    year: 2006,
    score: 8.4,
    episodes: 37,
    genres: ['Mystery', 'Psychological'],
    description:
      'A high school genius discovers a supernatural notebook that grants the power to end any life whose name is written inside.',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-lawCwhzhi96X.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
  },
  {
    id: '16498',
    type: 'ANIME',
    title: {
      english: 'Attack on Titan',
      romaji: 'Shingeki no Kyojin',
    },
    format: 'TV',
    year: 2013,
    score: 8.5,
    episodes: 25,
    genres: ['Action', 'Drama'],
    description:
      'Humanity fights for survival behind towering walls against colossal man-eating Titans.',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-73IhOXpJZiMF.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
  },
];
