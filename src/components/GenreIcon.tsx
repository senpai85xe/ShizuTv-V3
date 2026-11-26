import React from 'react';
import {
  Anchor,
  Atom,
  Binoculars,
  Biohazard,
  Bone,
  BookMarked,
  Bot,
  Brain,
  Briefcase,
  Building2,
  Castle,
  CircleDot,
  Clock,
  CloudRain,
  Coffee,
  Cog,
  Coins,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Drama,
  Droplet,
  Dumbbell,
  Eye,
  EyeOff,
  Feather,
  Flag,
  Flame,
  FlameKindling,
  FlaskConical,
  Flower2,
  Gamepad2,
  Gem,
  Ghost,
  Globe,
  GraduationCap,
  Guitar,
  HeartHandshake,
  HelpCircle,
  Home,
  Infinity as InfinityIcon,
  KeyRound,
  Landmark,
  Laptop,
  Laugh,
  Lightbulb,
  MapPin,
  Medal,
  MessageSquareQuote,
  Mic2,
  MoonStar,
  Mountain,
  Music,
  Orbit,
  PawPrint,
  Radar,
  RefreshCw,
  Rocket,
  Scale,
  ScrollText,
  Search,
  Shield,
  Skull,
  Smile,
  Sparkles,
  Sprout,
  Sun,
  Sunrise,
  Sword,
  Swords,
  Syringe,
  Tag,
  Target,
  Tent,
  TrendingUp,
  Trophy,
  Utensils,
  VenetianMask,
  Wand2,
  Zap,
} from 'lucide-react';
import { GenreIconId } from '../utils/genreMetadata';

interface GenreIconProps {
  iconId: GenreIconId;
  className?: string;
}

export const GenreIcon: React.FC<GenreIconProps> = ({ iconId, className = 'w-5 h-5' }) => {
  switch (iconId) {
    case 'swords':
      return <Swords className={className} strokeWidth={2.2} />;
    case 'compass':
      return <Compass className={className} strokeWidth={2.2} />;
    case 'moonStar':
      return <MoonStar className={className} strokeWidth={2.2} />;
    case 'comedyFace':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <g transform="rotate(-10 12 12)">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <circle cx="9.2" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="14.8" cy="10" r="1" fill="currentColor" stroke="none" />
            <path d="M8.5 13.8c1 1.6 2.2 2.2 3.5 2.2s2.5-.6 3.5-2.2" />
          </g>
        </svg>
      );
    case 'coffee':
      return <Coffee className={className} strokeWidth={2.2} />;
    case 'dualHearts':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <path d="M12.6 19.6S4.5 14.5 4.5 9.2a3.7 3.7 0 0 1 6.7-2.2 3.7 3.7 0 0 1 6.7 2.2c0 5.3-5.3 10.4-5.3 10.4Z" />
          <path d="M16.8 5.2a3.2 3.2 0 0 1 4.2 3c0 3.7-3.4 6.8-5.1 8.2" />
        </svg>
      );
    case 'drama':
      return <Drama className={className} strokeWidth={2.1} />;
    case 'detective':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <path d="M4 11.5h16" />
          <path d="M6.8 11.5 8.5 5.6a1.5 1.5 0 0 1 1.8-1l1.7.5 1.7-.5a1.5 1.5 0 0 1 1.8 1l1.7 5.9" />
          <circle cx="8.5" cy="16.5" r="2.7" />
          <circle cx="15.5" cy="16.5" r="2.7" />
          <path d="M11.2 16.5h1.6" />
        </svg>
      );
    case 'pulseWatch':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <path d="M9 3h6l.8 3H8.2L9 3Z" />
          <path d="M9 21h6l.8-3H8.2L9 21Z" />
          <rect x="6" y="6" width="12" height="12" rx="3" />
          <path d="M8.5 12h1.6l1.1-2.4 1.6 4.8 1.1-2.4h1.6" />
        </svg>
      );
    case 'flame':
      return <Flame className={className} strokeWidth={2.2} />;
    case 'ninja':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M4.2 10.2h15.6" />
          <path d="M4.2 14h15.6" />
          <circle cx="9.2" cy="12.1" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.8" cy="12.1" r="1" fill="currentColor" stroke="none" />
          <path d="M19.8 9.2 22 7.5M19.8 12.2 22.3 13" />
        </svg>
      );
    case 'haremRings':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="8.2" r="4" />
          <circle cx="8.2" cy="14.8" r="4" />
          <circle cx="15.8" cy="14.8" r="4" />
        </svg>
      );
    case 'rocket':
      return <Rocket className={className} strokeWidth={2.1} />;
    case 'skull':
      return <Skull className={className} strokeWidth={2.1} />;
    case 'brain':
      return <Brain className={className} strokeWidth={2.1} />;
    case 'trophy':
      return <Trophy className={className} strokeWidth={2.1} />;
    case 'bot':
      return <Bot className={className} strokeWidth={2.1} />;
    case 'music':
      return <Music className={className} strokeWidth={2.1} />;
    case 'flameHeart':
      return <FlameKindling className={className} strokeWidth={2.1} />;
    case 'wand':
      return <Wand2 className={className} strokeWidth={2.1} />;

    // Distinct per-tag icons
    case 'tagGlobe':
      return <Globe className={className} strokeWidth={2.1} />;
    case 'tagRefresh':
      return <RefreshCw className={className} strokeWidth={2.1} />;
    case 'tagSparkles':
      return <Sparkles className={className} strokeWidth={2.1} />;
    case 'tagGradCap':
      return <GraduationCap className={className} strokeWidth={2.1} />;
    case 'tagClock':
      return <Clock className={className} strokeWidth={2.1} />;
    case 'tagCpu':
      return <Cpu className={className} strokeWidth={2.1} />;
    case 'tagGhost':
      return <Ghost className={className} strokeWidth={2.1} />;
    case 'tagDroplet':
      return <Droplet className={className} strokeWidth={2.1} />;
    case 'tagBiohazard':
      return <Biohazard className={className} strokeWidth={2.1} />;
    case 'tagSword':
      return <Sword className={className} strokeWidth={2.1} />;
    case 'tagZap':
      return <Zap className={className} strokeWidth={2.1} />;
    case 'tagLandmark':
      return <Landmark className={className} strokeWidth={2.1} />;
    case 'tagCrosshair':
      return <Crosshair className={className} strokeWidth={2.1} />;
    case 'tagTrendingUp':
      return <TrendingUp className={className} strokeWidth={2.1} />;
    case 'tagShield':
      return <Shield className={className} strokeWidth={2.1} />;
    case 'tagFlower':
      return <Flower2 className={className} strokeWidth={2.1} />;
    case 'tagGem':
      return <Gem className={className} strokeWidth={2.1} />;
    case 'tagHeartHandshake':
      return <HeartHandshake className={className} strokeWidth={2.1} />;
    case 'tagTent':
      return <Tent className={className} strokeWidth={2.1} />;
    case 'tagEyeOff':
      return <EyeOff className={className} strokeWidth={2.1} />;
    case 'tagBuilding':
      return <Building2 className={className} strokeWidth={2.1} />;
    case 'tagOrbit':
      return <Orbit className={className} strokeWidth={2.1} />;
    case 'tagSyringe':
      return <Syringe className={className} strokeWidth={2.1} />;
    case 'tagCloudRain':
      return <CloudRain className={className} strokeWidth={2.1} />;
    case 'tagInfinity':
      return <InfinityIcon className={className} strokeWidth={2.1} />;
    case 'tagSprout':
      return <Sprout className={className} strokeWidth={2.1} />;
    case 'tagCastle':
      return <Castle className={className} strokeWidth={2.1} />;
    case 'tagGamepad':
      return <Gamepad2 className={className} strokeWidth={2.1} />;
    case 'tagScroll':
      return <ScrollText className={className} strokeWidth={2.1} />;
    case 'tagRadar':
      return <Radar className={className} strokeWidth={2.1} />;
    case 'tagCog':
      return <Cog className={className} strokeWidth={2.1} />;
    case 'tagBriefcase':
      return <Briefcase className={className} strokeWidth={2.1} />;
    case 'tagCoins':
      return <Coins className={className} strokeWidth={2.1} />;
    case 'tagScale':
      return <Scale className={className} strokeWidth={2.1} />;
    case 'tagHelp':
      return <HelpCircle className={className} strokeWidth={2.1} />;
    case 'tagCrown':
      return <Crown className={className} strokeWidth={2.1} />;
    case 'tagSun':
      return <Sun className={className} strokeWidth={2.1} />;
    case 'tagFeather':
      return <Feather className={className} strokeWidth={2.1} />;
    case 'tagFlask':
      return <FlaskConical className={className} strokeWidth={2.1} />;
    case 'tagBone':
      return <Bone className={className} strokeWidth={2.1} />;
    case 'tagSearch':
      return <Search className={className} strokeWidth={2.1} />;
    case 'tagLaugh':
      return <Laugh className={className} strokeWidth={2.1} />;
    case 'tagQuote':
      return <MessageSquareQuote className={className} strokeWidth={2.1} />;
    case 'tagSmile':
      return <Smile className={className} strokeWidth={2.1} />;
    case 'tagUtensils':
      return <Utensils className={className} strokeWidth={2.1} />;
    case 'tagLaptop':
      return <Laptop className={className} strokeWidth={2.1} />;
    case 'tagHome':
      return <Home className={className} strokeWidth={2.1} />;
    case 'tagSunrise':
      return <Sunrise className={className} strokeWidth={2.1} />;
    case 'tagMic':
      return <Mic2 className={className} strokeWidth={2.1} />;
    case 'tagGuitar':
      return <Guitar className={className} strokeWidth={2.1} />;
    case 'tagCircleDot':
      return <CircleDot className={className} strokeWidth={2.1} />;
    case 'tagMedal':
      return <Medal className={className} strokeWidth={2.1} />;
    case 'tagFlag':
      return <Flag className={className} strokeWidth={2.1} />;
    case 'tagDumbbell':
      return <Dumbbell className={className} strokeWidth={2.1} />;
    case 'tagTarget':
      return <Target className={className} strokeWidth={2.1} />;
    case 'tagEye':
      return <Eye className={className} strokeWidth={2.1} />;
    case 'tagVenetianMask':
      return <VenetianMask className={className} strokeWidth={2.1} />;
    case 'tagBookMarked':
      return <BookMarked className={className} strokeWidth={2.1} />;
    case 'tagAnchor':
      return <Anchor className={className} strokeWidth={2.1} />;
    case 'tagAtom':
      return <Atom className={className} strokeWidth={2.1} />;
    case 'tagBinoculars':
      return <Binoculars className={className} strokeWidth={2.1} />;
    case 'tagKeyRound':
      return <KeyRound className={className} strokeWidth={2.1} />;
    case 'tagLightbulb':
      return <Lightbulb className={className} strokeWidth={2.1} />;
    case 'tagMountain':
      return <Mountain className={className} strokeWidth={2.1} />;
    case 'tagMapPin':
      return <MapPin className={className} strokeWidth={2.1} />;
    case 'tagPawPrint':
      return <PawPrint className={className} strokeWidth={2.1} />;
    default:
      return <Tag className={className} strokeWidth={2.1} />;
  }
};
