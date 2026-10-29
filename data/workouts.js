// =============================================================
// TRAINING PLANS
// days: weekday → { t: title, x: [[exercise, sets, reps], ...] }
// A day with no exercises is a rest day.
// =============================================================

const REST = { t: 'Rest & recover', rest: true, x: [['Walk 20–30 min', 1, 'easy'], ['Full-body stretching', 1, '10–15 min']] };

const PUSH_A = { t: 'Push — Chest, Shoulders, Triceps', x: [['Bench Press', 4, '8–10'], ['Overhead Press', 3, '8–10'], ['Incline Dumbbell Press', 3, '10–12'], ['Lateral Raises', 3, '12–15'], ['Triceps Pushdown', 3, '10–12']] };
const PULL_A = { t: 'Pull — Back, Biceps', x: [['Deadlift', 4, '6–8'], ['Lat Pulldown', 3, '8–10'], ['Seated Cable Row', 3, '10–12'], ['Face Pulls', 3, '15'], ['Bicep Curls', 3, '10–12']] };
const LEGS_A = { t: 'Legs', x: [['Back Squat', 4, '8–10'], ['Leg Press', 3, '10–12'], ['Walking Lunges', 3, '12/leg'], ['Leg Curls', 3, '12'], ['Standing Calf Raises', 4, '15']] };
const PUSH_B = { t: 'Push — Chest, Shoulders, Triceps', x: [['Incline Barbell Press', 4, '8–10'], ['Dumbbell Shoulder Press', 3, '10'], ['Cable Flyes', 3, '12–15'], ['Lateral Raises', 3, '15'], ['Skullcrushers', 3, '10']] };
const PULL_B = { t: 'Pull — Back, Biceps', x: [['Barbell Row', 4, '8–10'], ['Pull-ups', 3, 'max'], ['Single-arm Dumbbell Row', 3, '10/side'], ['Hammer Curls', 3, '12'], ['Shrugs', 3, '12']] };

export const PLANS = [
  {
    id: 'ppl5', name: 'Push Pull Legs', tag: '5 days · muscle gain', goals: ['gain', 'recomp'], level: 'Intermediate',
    blurb: 'The classic bulk split. Each muscle hit with heavy compounds + accessories.',
    days: { Monday: PUSH_A, Tuesday: PULL_A, Wednesday: REST, Thursday: LEGS_A, Friday: PUSH_B, Saturday: PULL_B, Sunday: REST },
  },
  {
    id: 'ul4', name: 'Upper / Lower', tag: '4 days · strength + size', goals: ['gain', 'recomp', 'maintain'], level: 'Beginner–Intermediate',
    blurb: 'Two upper and two lower days. Great balance of recovery and volume.',
    days: {
      Monday: { t: 'Upper — Strength', x: [['Bench Press', 4, '5–6'], ['Barbell Row', 4, '5–6'], ['Overhead Press', 3, '8'], ['Lat Pulldown', 3, '10'], ['Bicep Curls', 2, '12'], ['Triceps Pushdown', 2, '12']] },
      Tuesday: { t: 'Lower — Strength', x: [['Back Squat', 4, '5–6'], ['Romanian Deadlift', 3, '8'], ['Leg Press', 3, '10'], ['Leg Curls', 3, '12'], ['Calf Raises', 4, '15']] },
      Wednesday: REST,
      Thursday: { t: 'Upper — Hypertrophy', x: [['Incline Dumbbell Press', 4, '10'], ['Seated Cable Row', 4, '10'], ['Lateral Raises', 4, '15'], ['Pull-ups', 3, 'max'], ['Hammer Curls', 3, '12'], ['Overhead Triceps Extension', 3, '12']] },
      Friday: { t: 'Lower — Hypertrophy', x: [['Front Squat / Goblet Squat', 4, '10'], ['Walking Lunges', 3, '12/leg'], ['Hip Thrust', 3, '10'], ['Leg Extensions', 3, '15'], ['Calf Raises', 4, '15']] },
      Saturday: REST, Sunday: REST,
    },
  },
  {
    id: 'fb3', name: 'Full Body Starter', tag: '3 days · beginner', goals: ['gain', 'maintain', 'lose', 'recomp'], level: 'Beginner',
    blurb: 'New to the gym? Learn the big lifts with plenty of rest days.',
    days: {
      Monday: { t: 'Full Body A', x: [['Goblet Squat', 3, '10'], ['Dumbbell Bench Press', 3, '10'], ['Lat Pulldown', 3, '10'], ['Plank', 3, '30 s']] },
      Tuesday: REST,
      Wednesday: { t: 'Full Body B', x: [['Romanian Deadlift', 3, '10'], ['Overhead Press', 3, '10'], ['Seated Cable Row', 3, '10'], ['Walking Lunges', 2, '10/leg']] },
      Thursday: REST,
      Friday: { t: 'Full Body C', x: [['Leg Press', 3, '12'], ['Push-ups', 3, 'max'], ['Dumbbell Row', 3, '10/side'], ['Bicep Curls', 2, '12'], ['Crunches', 3, '15']] },
      Saturday: REST, Sunday: REST,
    },
  },
  {
    id: 'cut4', name: 'Fat-Loss Hybrid', tag: '4 days · lift + cardio', goals: ['lose', 'recomp'], level: 'All levels',
    blurb: 'Keep muscle with heavy lifting while cardio and steps drive the deficit.',
    days: {
      Monday: { t: 'Full Body Strength + 15 min incline walk', x: [['Back Squat', 3, '8'], ['Bench Press', 3, '8'], ['Barbell Row', 3, '8'], ['Incline Treadmill Walk', 1, '15 min']] },
      Tuesday: { t: 'HIIT Cardio', x: [['Warm-up jog', 1, '5 min'], ['Sprint 30 s / walk 90 s', 8, 'rounds'], ['Cool-down walk', 1, '5 min']] },
      Wednesday: REST,
      Thursday: { t: 'Full Body Strength + Core', x: [['Deadlift', 3, '6'], ['Overhead Press', 3, '8'], ['Pull-ups', 3, 'max'], ['Hanging Knee Raises', 3, '12'], ['Plank', 3, '45 s']] },
      Friday: { t: 'Steady Cardio', x: [['Cycling / Jog / Brisk walk', 1, '35–45 min'], ['Stretching', 1, '10 min']] },
      Saturday: { t: 'Active day — sports / 10k steps', x: [['Football / Badminton / Swim', 1, '45 min'], ['10,000 steps', 1, 'goal']] },
      Sunday: REST,
    },
  },
  {
    id: 'home4', name: 'Hostel Room Workout', tag: '4 days · no equipment', goals: ['gain', 'lose', 'maintain', 'recomp'], level: 'All levels',
    blurb: 'No gym access? Bodyweight progressions you can do between classes.',
    days: {
      Monday: { t: 'Push (bodyweight)', x: [['Push-ups', 4, 'max'], ['Pike Push-ups', 3, '8–12'], ['Chair Dips', 3, '12'], ['Diamond Push-ups', 3, 'max']] },
      Tuesday: { t: 'Legs (bodyweight)', x: [['Squats', 4, '20'], ['Bulgarian Split Squat (bed)', 3, '10/leg'], ['Glute Bridge', 3, '15'], ['Wall Sit', 3, '45 s'], ['Calf Raises (stairs)', 4, '20']] },
      Wednesday: REST,
      Thursday: { t: 'Pull + Core', x: [['Door-frame / Table Rows', 4, '10'], ['Backpack Curls', 3, '12'], ['Superman Hold', 3, '30 s'], ['Plank', 3, '45 s'], ['Bicycle Crunches', 3, '20']] },
      Friday: { t: 'Full Body Circuit', x: [['Burpees', 4, '10'], ['Jump Squats', 4, '15'], ['Mountain Climbers', 4, '30 s'], ['Push-ups', 4, '12']] },
      Saturday: REST, Sunday: REST,
    },
  },
];

export const DEFAULT_PLAN_FOR_GOAL = { gain: 'ppl5', recomp: 'ul4', maintain: 'ul4', lose: 'cut4' };
