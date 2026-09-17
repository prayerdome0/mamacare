/**
 * Baby development, month by month, for Mother & Baby mode.
 *
 * Ranges are deliberately wide: babies reach milestones at different times and
 * the app must never turn a normal variation into a worry. Where a delay could
 * matter, the guidance is "mention it to your provider", not a conclusion.
 */

export interface BabyStage {
  /** Inclusive month range, e.g. [0, 1]. */
  months: [number, number];
  label: string;
  feeding: string;
  sleep: string;
  development: string[];
  play: string[];
  /** Signs worth raising with a health worker. */
  talkToProvider: string[];
}

export const BABY_STAGES: BabyStage[] = [
  {
    months: [0, 1],
    label: 'Newborn (0–1 month)',
    feeding:
      'Breastfeed on demand — usually 8 to 12 times in 24 hours. Colostrum in the first days is exactly what the baby needs. Give no water, tea or other drinks unless a health worker advises it.',
    sleep: 'Newborns sleep 14–17 hours a day in short stretches. Always put the baby to sleep on their back, on a firm flat surface, with nothing else in the bed.',
    development: [
      'Lifts the head briefly when on the tummy.',
      'Focuses on faces about 20–30 cm away.',
      'Startles at loud sounds and settles at familiar voices.',
      'Curls arms and legs in a frog-like position.',
    ],
    play: ['Hold the baby close and talk or sing.', 'Let the baby look at your face.', 'Short supervised tummy time while awake.'],
    talkToProvider: ['Not feeding well, or fewer than six wet nappies a day after the first week.', 'Yellow eyes or skin in the first 24 hours.', 'Fever of 38 °C or more, or a temperature below 36 °C.'],
  },
  {
    months: [1, 3],
    label: '1–3 months',
    feeding: 'Feeds become a little longer and slightly less frequent. Continue breastfeeding on demand.',
    sleep: 'A longer stretch of sleep usually appears at night. Keep the back-to-sleep position for every sleep.',
    development: ['Smiles at people.', 'Coos and makes gurgling sounds.', 'Follows a moving object with the eyes.', 'Holds the head up more steadily.', 'Opens and shuts hands.'],
    play: ['Show brightly coloured objects and move them slowly side to side.', 'Copy the baby\'s sounds.', 'Tummy time several times a day while awake.'],
    talkToProvider: ['Not smiling at people by around 8 weeks.', 'Not following objects with the eyes.', 'Very stiff or very floppy.', 'Poor feeding or not gaining weight.'],
  },
  {
    months: [4, 6],
    label: '4–6 months',
    feeding:
      'Exclusive breastfeeding continues to around 6 months. From about 6 months, start complementary foods while continuing to breastfeed — ask your provider for local guidance.',
    sleep: 'Around 12–15 hours in 24 hours, with two or three naps.',
    development: ['Rolls over.', 'Reaches for and grasps toys.', 'Laughs and squeals.', 'Recognises familiar faces.', 'Begins to sit with support.', 'Puts objects in the mouth.'],
    play: ['Offer safe objects of different textures.', 'Play peek-a-boo.', 'Support the baby to sit and reach for a toy.'],
    talkToProvider: ['Not rolling by around 6 months.', 'Not reaching for objects.', 'Not making sounds or responding to sound.', 'Eyes crossing most of the time.'],
  },
  {
    months: [6, 9],
    label: '6–9 months',
    feeding: 'Two to three meals of soft, mashed family food a day plus breastmilk. Include foods rich in iron and vitamin A.',
    sleep: 'About 12–14 hours, with two naps.',
    development: ['Sits without support.', 'Crawls, shuffles or rolls to move around.', 'Passes objects from hand to hand.', 'Responds to their name.', 'Shows fear of strangers.', 'Begins babbling in syllables.'],
    play: ['Fill and empty a container with safe objects.', 'Roll a ball back and forth.', 'Read a picture book and name what you see.'],
    talkToProvider: ['Not sitting without support by around 9 months.', 'Not bearing weight on the legs when held upright.', 'Not babbling or responding to their name.', 'Losing skills they once had.'],
  },
  {
    months: [9, 12],
    label: '9–12 months',
    feeding: 'Three meals plus one or two snacks, with breastmilk. Finely chopped family food; avoid hard whole foods that can choke.',
    sleep: 'About 12–14 hours, with one or two naps.',
    development: ['Pulls to stand and cruises along furniture.', 'Waves bye-bye and plays pat-a-cake.', 'Says "mama" or "dada" with meaning.', 'Picks up small objects with thumb and finger.', 'Understands "no".'],
    play: ['Stack and knock down blocks.', 'Name body parts during play.', 'Let the baby practise standing with support.'],
    talkToProvider: ['Not crawling, shuffling or pulling to stand by 12 months.', 'No single words by 12 months.', 'Not pointing or showing objects.', 'Any loss of skills.'],
  },
  {
    months: [12, 18],
    label: '12–18 months',
    feeding: 'Family meals, three a day plus snacks. Breastfeeding can continue for as long as mother and baby wish.',
    sleep: 'About 11–14 hours including one nap.',
    development: ['Walks independently.', 'Says several single words.', 'Points to show interest.', 'Drinks from a cup with help.', 'Copies simple household actions.', 'Shows tantrums as independence grows.'],
    play: ['Push and pull toys.', 'Simple shape sorters.', 'Name things during everyday routines.'],
    talkToProvider: ['Not walking by around 18 months.', 'Fewer than six words by 18 months.', 'Not pointing to show you things.', 'Not responding to their name or to sounds.'],
  },
  {
    months: [18, 24],
    label: '18–24 months',
    feeding: 'Eats most family foods. Offer water between meals rather than sweet drinks.',
    sleep: 'About 11–14 hours including one nap.',
    development: ['Runs and climbs.', 'Puts two words together ("more water").', 'Kicks a ball.', 'Follows two-step instructions.', 'Shows increasing independence and preferences.'],
    play: ['Singing and rhymes with actions.', 'Drawing with a thick crayon.', 'Pretend play with cups, dolls or toy phones.'],
    talkToProvider: ['Not putting two words together by around 2 years.', 'Not walking steadily.', 'Losing words or skills they had.'],
  },
];

/** Stage for an age in months (clamped to the last defined stage). */
const LAST_STAGE: BabyStage = BABY_STAGES[BABY_STAGES.length - 1] as BabyStage;

export function stageForAgeInMonths(months: number): BabyStage {
  return BABY_STAGES.find((stage) => months >= stage.months[0] && months < stage.months[1]) ?? LAST_STAGE;
}

/** Whole and partial months between a date of birth and now. */
export function ageInMonths(dateOfBirth: string, asOf: Date = new Date()): { months: number; days: number } {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return { months: 0, days: 0 };
  let months = (asOf.getFullYear() - dob.getFullYear()) * 12 + (asOf.getMonth() - dob.getMonth());
  const anchor = new Date(dob);
  anchor.setMonth(anchor.getMonth() + months);
  if (anchor > asOf) {
    months -= 1;
    anchor.setMonth(anchor.getMonth() - 1);
  }
  const days = Math.max(0, Math.round((asOf.getTime() - anchor.getTime()) / 86_400_000));
  return { months: Math.max(0, months), days };
}

export function formatBabyAge(dateOfBirth: string, asOf: Date = new Date()): string {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 'Unknown age';
  const days = Math.floor((asOf.getTime() - dob.getTime()) / 86_400_000);
  if (days < 0) return 'Not born yet';
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} old`;
  const { months, days: extra } = ageInMonths(dateOfBirth, asOf);
  if (months < 24) return extra > 0 ? `${months} month${months === 1 ? '' : 's'} ${extra} day${extra === 1 ? '' : 's'}` : `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} year${years === 1 ? '' : 's'} ${rest} month${rest === 1 ? '' : 's'}` : `${years} year${years === 1 ? '' : 's'}`;
}

/** Feeding guidance that is safe to show to any mother, at any stage. */
export const SAFE_SLEEP = [
  'Always put the baby to sleep on their back, for every sleep, day and night.',
  'Use a firm, flat surface. No pillows, cushions, loose blankets or soft toys in the sleeping space.',
  'Keep the baby in your room, close to your bed, for the first six months if you can.',
  'Do not sleep with the baby on a sofa or armchair.',
  'Keep the room comfortably warm — not hot. Feel the chest or back to check, not the hands.',
  'Nobody should smoke near the baby, in the house or in a vehicle.',
];
