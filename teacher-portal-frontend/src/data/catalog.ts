import type { ClassRoom, Lesson, Subject, User } from '@/types';
import { deriveBlobPrefix, deriveContentKey, deriveLessonId } from '@/services/lessonKey';

/**
 * Reference data and first-run seed.
 *
 * Classes and subjects are reference data an administrator maintains. Lessons
 * are seeded here only so a fresh install has something to show — at runtime
 * they live in the directory store and are created through the admin console.
 */

export const CLASSES: ClassRoom[] = [
  { id: '5A', name: 'Class 5A', grade: 5, students: 32, room: 'Room 204', schedule: 'Mon, Wed, Fri · Period 2', subjectIds: ['math', 'science'] },
  { id: '6B', name: 'Class 6B', grade: 6, students: 29, room: 'Room 311', schedule: 'Tue, Thu · Period 4', subjectIds: ['math', 'science'] },
  { id: '7A', name: 'Class 7A', grade: 7, students: 34, room: 'Room 118', schedule: 'Mon–Fri · Period 6', subjectIds: ['math'] },
];

export const SUBJECTS: Subject[] = [
  {
    id: 'math',
    name: 'Mathematics',
    icon: 'math',
    chapters: ['Fractions & Decimals', 'Multiplication & Division', 'Geometry', 'Measurement', 'Data Handling', 'Integers'],
  },
  { id: 'science', name: 'Science', icon: 'science', chapters: ['Matter', 'Living World', 'Energy', 'Earth & Space'] },
];

export const getClass = (id?: string) => CLASSES.find((c) => c.id === id);
export const getSubject = (id?: string) => SUBJECTS.find((s) => s.id === id);

/** Default checklist offered when an admin creates a lesson. */
export const DEFAULT_TOPICS = ['Introduction', 'Core concept', 'Worked examples', 'Guided practice', 'Real-world examples', 'Practice questions'];

interface SeedEntry {
  title: string;
  description: string;
  subjectId: string;
  chapter: string;
  durationMin: number;
  difficulty: Lesson['difficulty'];
  objectives: string[];
  materials: string[];
  topics: string[];
  classIds: string[];
}

const SEED: SeedEntry[] = [
  {
    title: 'Introduction to Fractions',
    description: 'Understand fractions, numerator, denominator and their real-world applications.',
    subjectId: 'math',
    chapter: 'Fractions & Decimals',
    durationMin: 45,
    difficulty: 'Beginner',
    objectives: [
      'Understand the concept of fractions',
      'Identify the numerator and denominator of a fraction',
      'Represent fractions visually using shapes and number lines',
      'Apply fractions to real-world situations',
    ],
    materials: ['Lesson Plan', 'Fraction Worksheet', 'Introduction Video'],
    topics: ['Introduction', 'What is a fraction?', 'Numerator', 'Denominator', 'Equivalent fractions', 'Real-world examples', 'Practice questions'],
    classIds: ['5A', '6B'],
  },
  {
    title: 'Working with Decimals',
    description: 'Read, write and compare decimal numbers and relate them to fractions.',
    subjectId: 'math',
    chapter: 'Fractions & Decimals',
    durationMin: 40,
    difficulty: 'Beginner',
    objectives: ['Read and write decimals', 'Compare decimal values', 'Convert between fractions and decimals'],
    materials: ['Lesson Plan', 'Place-value chart'],
    topics: ['Introduction', 'Place value', 'Reading decimals', 'Comparing decimals', 'Fraction to decimal', 'Practice questions'],
    classIds: ['5A', '6B', '7A'],
  },
  {
    title: 'Multiplication Strategies',
    description: 'Build fluency with multi-digit multiplication using area and column methods.',
    subjectId: 'math',
    chapter: 'Multiplication & Division',
    durationMin: 45,
    difficulty: 'Intermediate',
    objectives: ['Use the area model', 'Multiply multi-digit numbers', 'Estimate products'],
    materials: ['Lesson Plan', 'Grid paper'],
    topics: ['Introduction', 'Area model', 'Column method', 'Estimation', 'Word problems', 'Practice questions'],
    classIds: ['5A', '6B', '7A'],
  },
  {
    title: 'Division and Remainders',
    description: 'Divide multi-digit numbers and interpret remainders in context.',
    subjectId: 'math',
    chapter: 'Multiplication & Division',
    durationMin: 45,
    difficulty: 'Intermediate',
    objectives: ['Divide using long division', 'Interpret remainders', 'Check answers by multiplying'],
    materials: ['Lesson Plan', 'Counters'],
    topics: ['Introduction', 'Sharing and grouping', 'Long division', 'Remainders', 'Checking answers', 'Practice questions'],
    classIds: ['5A', '7A'],
  },
  {
    title: 'Shapes and Angles',
    description: 'Classify 2D shapes and measure angles with a protractor.',
    subjectId: 'math',
    chapter: 'Geometry',
    durationMin: 50,
    difficulty: 'Intermediate',
    objectives: ['Classify triangles and quadrilaterals', 'Measure angles', 'Identify lines of symmetry'],
    materials: ['Lesson Plan', 'Protractor set'],
    topics: ['Introduction', 'Types of angles', 'Triangles', 'Quadrilaterals', 'Symmetry', 'Practice questions'],
    classIds: ['6B', '7A'],
  },
  {
    title: 'Length, Mass and Capacity',
    description: 'Choose units, estimate and convert between metric measures.',
    subjectId: 'math',
    chapter: 'Measurement',
    durationMin: 40,
    difficulty: 'Beginner',
    objectives: ['Choose appropriate units', 'Convert metric units', 'Estimate measurements'],
    materials: ['Lesson Plan', 'Measuring tape'],
    topics: ['Introduction', 'Units of length', 'Units of mass', 'Units of capacity', 'Conversions', 'Practice questions'],
    classIds: ['5A'],
  },
  {
    title: 'Positive and Negative Numbers',
    description: 'Place integers on a number line and add or subtract them.',
    subjectId: 'math',
    chapter: 'Integers',
    durationMin: 45,
    difficulty: 'Intermediate',
    objectives: ['Order integers', 'Add integers', 'Subtract integers'],
    materials: ['Lesson Plan', 'Number line strip'],
    topics: ['Introduction', 'The number line', 'Ordering integers', 'Adding integers', 'Subtracting integers', 'Practice questions'],
    classIds: ['6B', '7A'],
  },
  {
    title: 'States of Matter',
    description: 'Compare solids, liquids and gases and the changes between them.',
    subjectId: 'science',
    chapter: 'Matter',
    durationMin: 45,
    difficulty: 'Beginner',
    objectives: ['Describe the three states', 'Explain melting and boiling', 'Give everyday examples'],
    materials: ['Lesson Plan', 'Demonstration kit'],
    topics: ['Introduction', 'Solids', 'Liquids', 'Gases', 'Changes of state', 'Practice questions'],
    classIds: ['5A', '6B'],
  },
  {
    title: 'Parts of a Plant',
    description: 'Identify plant parts and explain what each one does.',
    subjectId: 'science',
    chapter: 'Living World',
    durationMin: 40,
    difficulty: 'Beginner',
    objectives: ['Name the main parts', 'Explain their functions', 'Observe a real plant'],
    materials: ['Lesson Plan', 'Sample plant'],
    topics: ['Introduction', 'Roots', 'Stem', 'Leaves', 'Flowers', 'Practice questions'],
    classIds: ['5A'],
  },
  {
    title: 'Forms of Energy',
    description: 'Recognise forms of energy and how energy transfers between them.',
    subjectId: 'science',
    chapter: 'Energy',
    durationMin: 45,
    difficulty: 'Intermediate',
    objectives: ['List forms of energy', 'Describe transfers', 'Spot energy use at home'],
    materials: ['Lesson Plan', 'Torch and battery'],
    topics: ['Introduction', 'Light and heat', 'Sound', 'Electrical energy', 'Energy transfer', 'Practice questions'],
    classIds: ['6B'],
  },
];

/**
 * Seed lessons. Maths lessons use SHARED content (one folder per subject +
 * title, reused by every class) to show how a single plan serves several
 * classes; Science uses per-class folders.
 */
export function seedLessons(): Lesson[] {
  const out: Lesson[] = [];
  for (const entry of SEED) {
    const scope = entry.subjectId === 'math' ? 'shared' : 'per-class';
    for (const classId of entry.classIds) {
      const contentKey = deriveContentKey(scope, classId, entry.subjectId, entry.title);
      out.push({
        id: deriveLessonId(classId, entry.subjectId, entry.title),
        title: entry.title,
        description: entry.description,
        classId,
        subjectId: entry.subjectId,
        chapter: entry.chapter,
        durationMin: entry.durationMin,
        difficulty: entry.difficulty,
        objectives: entry.objectives,
        materials: entry.materials,
        topics: entry.topics,
        contentKey,
        blobPrefix: deriveBlobPrefix(contentKey),
        published: true,
        createdAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
      });
    }
  }
  return out;
}

export const ADMIN_ID = 'usr-admin';
export const TEACHER_ID = 'usr-t1024';

export function seedUsers(): User[] {
  const createdAt = new Date(Date.now() - 200 * 86_400_000).toISOString();
  return [
    {
      id: ADMIN_ID,
      employeeId: 'A1001',
      fullName: 'Priya Nair',
      email: 'priya.nair@lumenacademy.edu',
      title: 'Portal Administrator',
      role: 'ADMIN',
      mustChange: false,
      active: true,
      createdAt,
    },
    {
      id: TEACHER_ID,
      employeeId: 'T1024',
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@lumenacademy.edu',
      title: 'Mathematics Teacher',
      role: 'TEACHER',
      mustChange: false,
      active: true,
      createdAt,
    },
    {
      id: 'usr-t1098',
      employeeId: 'T1098',
      fullName: 'Anita Desai',
      email: 'anita.desai@lumenacademy.edu',
      title: 'Science Teacher',
      role: 'TEACHER',
      mustChange: true,
      active: true,
      createdAt,
    },
  ];
}

/** Rahul: Maths across all three classes, plus Science for 5A. Anita: Science. */
export function seedAssignments() {
  const at = new Date(Date.now() - 180 * 86_400_000).toISOString();
  return [
    { userId: TEACHER_ID, classId: '5A', subjectId: 'math', assignedAt: at },
    { userId: TEACHER_ID, classId: '6B', subjectId: 'math', assignedAt: at },
    { userId: TEACHER_ID, classId: '7A', subjectId: 'math', assignedAt: at },
    { userId: TEACHER_ID, classId: '5A', subjectId: 'science', assignedAt: at },
    { userId: 'usr-t1098', classId: '6B', subjectId: 'science', assignedAt: at },
  ];
}
