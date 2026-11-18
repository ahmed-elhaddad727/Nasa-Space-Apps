import { BackendResponse } from './services/cropApi';

export type Lang = 'en' | 'ar';

export const UI_TEXT = {
  en: {
    langToggleLabel: 'العربية',
    listen: 'Listen',
    stopListening: 'Stop',
    mapTitle: 'What should you plant here?',
    mapSubtitle:
      "Drop a pin anywhere on Earth. We read NASA's latest weather and soil data for that spot and suggest crops that fit.",
    mapHint:
      'Click or drag to place the pin. Scroll to zoom, right-click and drag to move the map.',
    reset: 'Reset',
    readingLand: 'Reading the land…',
    getRecommendations: 'Get crop recommendations',
    useMyLocation: 'Use my location',
    locating: 'Finding your location…',
    locationFound: 'Location found, analyzing soil and climate…',
    geoNotSupported: 'Geolocation is not supported by your browser.',
    geoDenied:
      'Location permission was denied. Please allow location access or pick a spot on the map.',
    geoUnavailable: 'Could not determine your location. Please try again.',
    fetchError:
      "Couldn't get climate data for this spot. Check your connection and try again.",
    pickAnotherSpot: '← Pick another spot',
    nasaHeader: 'NASA POWER Soil & Climate Analysis',
    suitableHeadline:
      'According to your soil and climate, here are the best crops for your land',
    unsuitableHeadline:
      'This location is currently unsuitable for crop rotation',
    tempLabel: 'Temperature (2m)',
    soilWetnessLabel: 'Soil Wetness',
    humidityLabel: 'Humidity',
    precipLabel: 'Precipitation',
    seasonLabel: 'Season',
    matchLabel: 'Match',
    plantNextLabel: 'Plant next: ',
    whyUnsuitableTitle: 'Why crops cannot be recommended here',
    supportedRegionsNote:
      'Supported ML regions: Egypt (21°N–32°N, 24°E–37°E) & Contiguous US (24°N–50°N, 66°W–125°W) with crop suitability ≥ 30%.',
    tryAnotherLocation: 'Try another location',
  },
  ar: {
    langToggleLabel: 'EN',
    listen: 'استمع',
    stopListening: 'إيقاف',
    mapTitle: 'ماذا يجب أن تزرع هنا؟',
    mapSubtitle:
      'ضع دبوساً في أي مكان على الأرض. نقرأ أحدث بيانات الطقس والتربة من وكالة ناسا لهذه النقطة ونقترح المحاصيل الأنسب.',
    mapHint:
      'انقر أو اسحب لوضع الدبوس. مرر للتكبير، وانقر بزر الفأرة الأيمن واسحب لتحريك الخريطة.',
    reset: 'إعادة ضبط',
    readingLand: 'جارٍ قراءة بيانات الأرض…',
    getRecommendations: 'احصل على توصيات المحاصيل',
    useMyLocation: 'استخدم موقعي الحالي',
    locating: 'جارٍ تحديد موقعك…',
    locationFound: 'تم تحديد موقعك، جارٍ تحليل التربة والمناخ…',
    geoNotSupported: 'تحديد الموقع غير مدعوم في هذا المتصفح.',
    geoDenied:
      'تم رفض إذن الوصول للموقع. يرجى السماح به أو اختيار نقطة على الخريطة.',
    geoUnavailable: 'تعذر تحديد موقعك الحالي. يرجى المحاولة مرة أخرى.',
    fetchError:
      'تعذر الحصول على بيانات المناخ لهذه النقطة. تحقق من اتصالك وحاول مرة أخرى.',
    pickAnotherSpot: '→ اختر موقعاً آخر',
    nasaHeader: 'تحليل التربة والمناخ من NASA POWER',
    suitableHeadline:
      'وفقاً لتربتك ومناخك، إليك أفضل المحاصيل المناسبة لأرضك',
    unsuitableHeadline: 'هذا الموقع غير صالح حالياً للدورة الزراعية',
    tempLabel: 'درجة الحرارة (2م)',
    soilWetnessLabel: 'رطوبة التربة',
    humidityLabel: 'الرطوبة الجوية',
    precipLabel: 'هطول الأمطار',
    seasonLabel: 'الموسم',
    matchLabel: 'نسبة الملاءمة',
    plantNextLabel: 'ازرع تالياً: ',
    whyUnsuitableTitle: 'لماذا لا يمكن التوصية بمحاصيل في هذا الموقع',
    supportedRegionsNote:
      'المناطق المدعومة: مصر (21°–32° شمالاً، 24°–37° شرقاً) والولايات المتحدة (24°–50° شمالاً، 66°–125° غرباً) بنسبة ملاءمة ≥ 30%.',
    tryAnotherLocation: 'جرّب موقعاً آخر',
  },
};

const CROP_AR: Record<string, string> = {
  wheat: 'القمح',
  maize: 'الذرة الشامية',
  corn: 'الذرة',
  rice: 'الأرز',
  cotton: 'القطن',
  sugarcane: 'قصب السكر',
  'sugar beet': 'بنجر السكر',
  tomato: 'الطماطم',
  potato: 'البطاطس',
  onion: 'البصل',
  garlic: 'الثوم',
  'faba bean': 'الفول البلدي',
  'broad bean': 'الفول',
  barley: 'الشعير',
  alfalfa: 'البرسيم الحجازي',
  clover: 'البرسيم',
  berseem: 'البرسيم المصري',
  'date palm': 'نخيل التمر',
  citrus: 'الموالح',
  orange: 'البرتقال',
  mango: 'المانجو',
  grape: 'العنب',
  banana: 'الموز',
  soybean: 'فول الصويا',
  sunflower: 'عباد الشمس',
  oats: 'الشوفان',
  rye: 'الجاودار',
  sorghum: 'الذرة الرفيعة',
  peanut: 'الفول السوداني',
  rapeseed: 'بذور اللفت',
  canola: 'الكانولا',
  lentil: 'العدس',
  chickpea: 'الحمص',
  'common bean': 'الفاصوليا',
  'dry bean': 'الفاصوليا الجافة',
  pea: 'البازلاء',
  'sweet potato': 'البطاطا الحلوة',
  lettuce: 'الخس',
  broccoli: 'البروكلي',
  carrot: 'الجزر',
  spinach: 'السبانخ',
  cabbage: 'الكرنب',
  apple: 'التفاح',
  strawberry: 'الفراولة',
  blueberry: 'التوت الأزرق',
  peach: 'الخوخ',
  cherry: 'الكرز',
  watermelon: 'البطيخ',
  almond: 'اللوز',
  walnut: 'الجوز',
  pistachio: 'الفستق',
  pecan: 'البقان',
};

export function translateCrop(crop: string, lang: Lang): string {
  if (lang === 'en') return crop;
  const key = crop.trim().toLowerCase();
  return CROP_AR[key] || crop;
}

export function translateRotationChain(chain: string, lang: Lang): string {
  if (lang === 'en') return chain;
  return chain
    .split(',')
    .map((option) =>
      option
        .split('→')
        .map((c) => translateCrop(c.trim(), 'ar'))
        .join(' ← ')
    )
    .join('، ');
}

export function translateSeason(season: string, lang: Lang): string {
  if (lang === 'en') return season;
  return season
    .replace(/winter/gi, 'شتاء')
    .replace(/summer/gi, 'صيف')
    .replace(/spring/gi, 'ربيع')
    .replace(/fall/gi, 'خريف');
}

export function translateNotes(notes: string, lang: Lang): string {
  if (lang === 'en') return notes;
  const match = notes.match(
    /score:\s*([\d.]+)\/100\.\s*Unmet water need:\s*([\d.]+)%\s*\(irrigation deficit:\s*([\d.]+)\s*mm\/mo\)/i
  );
  if (match) {
    return `تقييم الدورة الزراعية: ${match[1]}/100. الاحتياج المائي غير المغطى بالأمطار: ${match[2]}% (عجز الري الشهري: ${match[3]} مم/شهر).`;
  }
  return notes;
}

export function translateUnsuitableReason(
  reason: string | undefined,
  lang: Lang
): string {
  if (!reason) return '';
  if (lang === 'en') return reason;

  if (reason.includes('outside supported regions')) {
    return 'الإحداثيات المختارة تقع خارج المناطق المدعومة حالياً في النموذج (مصر والولايات المتحدة الأمريكية).';
  }
  if (reason.includes('No valid NASA POWER data')) {
    return 'لا تتوفر بيانات مناخية أو تربة صالحة من وكالة ناسا لهذه الإحداثيات (قد تكون فوق مسطح مائي).';
  }

  let ar = reason;
  ar = ar.replace(
    /No crop met the minimum (\d+)% suitability threshold for ([^ ]+ [^ ]+) due to /i,
    (_, pct, season) =>
      `لم يتجاوز أي محصول الحد الأدنى للملاءمة (${pct}%) لموسم ${translateSeason(
        season,
        'ar'
      )} بسبب `
  );
  ar = ar.replace(
    /severe cold stress during ([^ (]+) \([^)]*seasonal mean temperature is ([\d.-]+)°C with an absolute minimum of ([\d.-]+)°C\)/gi,
    (_, s, tmean, tmin) =>
      `برودة شديدة خلال الفصل (متوسط الحرارة الموسمي ${tmean}°C وأدنى درجة حرارة ${tmin}°C)`
  );
  ar = ar.replace(
    /extreme heat stress during ([^ (]+) \([^)]*average daily high is ([\d.-]+)°C with peaks reaching ([\d.-]+)°C\)/gi,
    (_, s, tmaxMean, tmaxAbs) =>
      `إجهاد حراري مرتفع جداً (متوسط العظمى اليومية ${tmaxMean}°C مع ذروة تصل إلى ${tmaxAbs}°C)`
  );
  ar = ar.replace(
    /critically low root-zone soil wetness \(([\d.-]+)\%\) and low seasonal precipitation \(([\d.-]+) mm\)/gi,
    'انخفاض حاد في رطوبة التربة (\$1%) وقلة الأمطار الموسمية (\$2 مم)'
  );
  ar = ar.replace(
    /unfavorable agroclimatic balance during ([^ (]+) \(mean temp ([\d.-]+)°C, soil moisture ([\d.-]+)\%, seasonal rainfall ([\d.-]+) mm\)/gi,
    'عدم توازن الظروف المناخية والزراعية (متوسط الحرارة \$2°C، رطوبة التربة \$3%، الأمطار الموسمية \$4 مم)'
  );
  ar = ar.replace(/ and /g, ' بالإضافة إلى ');
  ar = ar.replace(
    /Even the most resilient candidate \(([^)]+)\) only reached ([\d.]+)% suitability\./i,
    (_, crop, score) =>
      `حتى أكثر المحاصيل تحملاً (${translateCrop(
        crop,
        'ar'
      )}) حقق نسبة ملاءمة ${score}% فقط.`
  );

  return ar;
}

export function buildResultsSpeech(
  result: BackendResponse,
  lang: Lang
): string {
  const isSuitable =
    result.status === 'suitable' && result.recommendations.length > 0;

  if (!isSuitable) {
    const reason = translateUnsuitableReason(result.unsuitable_reason, lang);
    return lang === 'ar'
      ? `هذا الموقع غير صالح حالياً للدورة الزراعية. ${reason}`
      : `This location is currently unsuitable for crop rotation. ${reason}`;
  }

  if (lang === 'ar') {
    const items = result.recommendations.map((item) => {
      const crop = translateCrop(item.crop, 'ar');
      const next = item.rotation_next
        .split(',')
        .map((c) => translateCrop(c.trim(), 'ar'))
        .join(' أو ');
      return `${crop} بنسبة ملاءمة ${item.suitability_score} بالمئة، ويزرع بعده ${next}`;
    });
    return `أفضل المحاصيل لأرضك هي: ${items.join('. ثم ')}.`;
  }

  const items = result.recommendations.map((item) => {
    const next = item.rotation_next.replace(/,/g, ' or');
    return `${item.crop} at ${item.suitability_score} percent match, followed by ${next}`;
  });
  return `Best crops for your land: ${items.join('. Next option: ')}.`;
}