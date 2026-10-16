import type { DocBlock, DocPage, GameQuestion, Lesson, ProtectedDocument, QnAItem, Resource, Video } from '@/types';

let seq = 0;
const b = (type: DocBlock['type'], text: string): DocBlock => ({ id: `b${++seq}`, type, text });
const page = (number: number, blocks: DocBlock[]): DocPage => ({ number, blocks });

/** A realistic eight-page lesson plan for the Fractions lesson. */
function fractionsPlan(lesson: Lesson): ProtectedDocument {
  return {
    id: `plan-${lesson.id}`,
    title: lesson.title,
    subtitle: `Grade ${lesson.classId.replace(/\D/g, '')} · Mathematics · ${lesson.chapter}`,
    origin: 'demo',
    pages: [
      page(1, [
        b('meta', `Grade ${lesson.classId.replace(/\D/g, '')} · Mathematics · Chapter: ${lesson.chapter} · Duration: ${lesson.durationMin} minutes`),
        b('h1', lesson.title),
        b('meta', 'Prepared by: Mathematics Curriculum Team · Version 3.2 · Approved for academic year 2026–27'),
        b('h2', 'Learning objectives'),
        b('p', 'By the end of this lesson, students will be able to:'),
        b('li', 'Explain what a fraction represents as part of a whole.'),
        b('li', 'Identify the numerator and denominator of a fraction.'),
        b('li', 'Represent simple fractions using shapes and a number line.'),
        b('li', 'Recognise fractions in everyday situations such as food, time and money.'),
        b('h2', 'Prior knowledge assumed'),
        b('p', 'Students should be comfortable with whole numbers to 100, equal sharing, and the language of halves and quarters from Grade 4.'),
      ]),
      page(2, [
        b('h2', 'Materials and preparation'),
        b('li', 'Fraction circles or paper strips, one set per pair of students.'),
        b('li', 'Printed fraction worksheet (attached as a resource in this lesson).'),
        b('li', 'Board space for the shared number line.'),
        b('li', 'Introduction video queued before the class begins.'),
        b('h2', 'Room setup'),
        b('p', 'Arrange desks in pairs so students can fold and compare paper strips together. Reserve the left half of the board for the number line, which stays up for the whole lesson.'),
        b('quote', 'Teaching note: prepare one strip already folded into thirds. Thirds are harder to fold accurately and the prepared strip saves several minutes.'),
      ]),
      page(3, [
        b('h2', 'Warm-up (5 minutes)'),
        b('p', 'Hold up a chapati or a paper circle and ask how it could be shared fairly between two students, then four. Draw each split on the board as students answer.'),
        b('p', 'Ask the key question: what makes a share fair? Steer the discussion towards equal parts rather than simply two pieces. This distinction is the foundation of the whole lesson.'),
        b('h3', 'Expected responses'),
        b('li', 'Cut it down the middle — accept, then ask whether both halves are the same size.'),
        b('li', 'Give one person more — use this to contrast fair and unfair sharing.'),
      ]),
      page(4, [
        b('h2', 'Direct instruction (12 minutes)'),
        b('p', 'Introduce the written form of a fraction. Write one half on the board and name each part aloud as you point to it.'),
        b('h3', 'Numerator'),
        b('p', 'The number above the line. It counts how many equal parts we are talking about. Emphasise that it is a count, not a size.'),
        b('h3', 'Denominator'),
        b('p', 'The number below the line. It tells us how many equal parts the whole was divided into. A larger denominator means smaller pieces, which students often find counter-intuitive.'),
        b('quote', 'Common misconception: students read three quarters as the numbers three and four rather than as one quantity. Keep saying the fraction as a single name.'),
      ]),
      page(5, [
        b('h2', 'Guided practice (10 minutes)'),
        b('p', 'Students work in pairs with paper strips. Ask them to fold a strip into halves, then quarters, then eighths, shading one part at each stage.'),
        b('li', 'Circulate and ask each pair to read their shaded fraction aloud.'),
        b('li', 'Watch for unequal folds, which are the usual source of confusion later.'),
        b('li', 'Ask one pair to explain why eighths are smaller than quarters despite the larger number.'),
        b('h3', 'Checkpoint'),
        b('p', 'Before moving on, every pair should be able to name the shaded fraction of their own strip without prompting.'),
      ]),
      page(6, [
        b('h2', 'Equivalent fractions (8 minutes)'),
        b('p', 'Place the halves strip above the quarters strip so students can see that one half lines up exactly with two quarters.'),
        b('p', 'Record the pairs on the board as students find them. Do not introduce the multiplication rule yet; the visual match is what should stick in this lesson.'),
        b('li', 'One half and two quarters.'),
        b('li', 'One half and four eighths.'),
        b('li', 'Two quarters and four eighths.'),
      ]),
      page(7, [
        b('h2', 'Assessment for learning (6 minutes)'),
        b('p', 'Use quick whole-class checks rather than written work at this stage.'),
        b('li', 'Thumbs up or down: is this shape split into equal parts?'),
        b('li', 'Show me on your strip: three quarters.'),
        b('li', 'Exit question: which is larger, one third or one quarter, and how do you know?'),
        b('h3', 'Evidence to collect'),
        b('p', 'Note which students rely on counting pieces rather than comparing sizes. They will need the real-world examples revisited before the next lesson.'),
      ]),
      page(8, [
        b('h2', 'Closure (4 minutes)'),
        b('p', 'Ask students to name one place they will see a fraction before tomorrow. Collect four or five answers and leave them on the board.'),
        b('h2', 'Homework'),
        b('p', 'Fraction worksheet, questions one to eight. Question nine is an optional challenge for students who finished the guided practice early.'),
        b('h2', 'Differentiation'),
        b('li', 'Support: pre-folded strips and fractions limited to halves and quarters.'),
        b('li', 'Extension: ask students to find three fractions equivalent to one half.'),
        b('h2', 'Teacher reflection'),
        b('p', 'After teaching, record which topics were actually covered using the Coverage tab so the next lesson can start from the right point.'),
      ]),
    ],
  };
}

/** A shorter but still realistic plan used for every other lesson. */
function genericPlan(lesson: Lesson): ProtectedDocument {
  const grade = lesson.classId.replace(/\D/g, '');
  return {
    id: `plan-${lesson.id}`,
    title: lesson.title,
    subtitle: `Grade ${grade} · ${lesson.chapter}`,
    origin: 'demo',
    pages: [
      page(1, [
        b('meta', `Grade ${grade} · Chapter: ${lesson.chapter} · Duration: ${lesson.durationMin} minutes`),
        b('h1', lesson.title),
        b('meta', 'Prepared by: Curriculum Team · Version 2.0 · Approved for academic year 2026–27'),
        b('h2', 'Learning objectives'),
        ...lesson.objectives.map((o) => b('li', o)),
        b('h2', 'Overview'),
        b('p', lesson.description),
      ]),
      page(2, [
        b('h2', 'Materials'),
        ...lesson.materials.map((m) => b('li', m)),
        b('h2', 'Lesson sequence'),
        ...lesson.topics.map((t, i) => b('li', `${i + 1}. ${t}`)),
        b('quote', 'Record what was actually covered in the Coverage tab at the end of the session.'),
      ]),
      page(3, [
        b('h2', 'Assessment'),
        b('p', 'Use short verbal checks throughout rather than a single written test at the end. Note which students needed prompting.'),
        b('h2', 'Differentiation'),
        b('li', 'Support: work through the first example together before releasing the class.'),
        b('li', 'Extension: ask students to create a question of their own for a partner.'),
        b('h2', 'Homework'),
        b('p', 'Set the practice questions listed in the accompanying worksheet resource.'),
      ]),
    ],
  };
}

export function demoPlan(lesson: Lesson): ProtectedDocument {
  seq = 0;
  return /^introduction to fractions$/i.test(lesson.title) ? fractionsPlan(lesson) : genericPlan(lesson);
}

export function demoVideos(lesson: Lesson): Video[] {
  if (/^introduction to fractions$/i.test(lesson.title)) {
    return [
      { id: `${lesson.id}-v1`, title: 'Introduction to Fractions', description: 'A five-minute classroom introduction using paper strips and everyday objects.', durationSec: 312 },
      { id: `${lesson.id}-v2`, title: 'Fractions in Real Life', description: 'Where fractions show up in food, money and telling the time.', durationSec: 248 },
      { id: `${lesson.id}-v3`, title: 'Numerator and Denominator', description: 'A focused explanation of what each part of a fraction tells us.', durationSec: 186 },
    ];
  }
  return [
    { id: `${lesson.id}-v1`, title: `${lesson.title} — Overview`, description: 'A short classroom introduction to the key ideas in this lesson.', durationSec: 265 },
    { id: `${lesson.id}-v2`, title: `${lesson.title} — Worked Examples`, description: 'Two worked examples suitable for showing on the board.', durationSec: 198 },
  ];
}

export function demoResources(lesson: Lesson): Resource[] {
  return [
    { id: `${lesson.id}-r1`, name: `${lesson.title} Worksheet.pdf`, kind: 'pdf', sizeBytes: 428_000, pages: 4 },
    { id: `${lesson.id}-r2`, name: 'Teaching Activity Guide.docx', kind: 'docx', sizeBytes: 96_000, pages: 3 },
    { id: `${lesson.id}-r3`, name: 'Reference Notes.pdf', kind: 'pdf', sizeBytes: 215_000, pages: 6 },
    { id: `${lesson.id}-r4`, name: 'Classroom Presentation.pptx', kind: 'pptx', sizeBytes: 1_840_000, pages: 18 },
    { id: `${lesson.id}-r5`, name: 'Assessment Tracker.xlsx', kind: 'xlsx', sizeBytes: 52_000, pages: 2 },
  ];
}

export function demoQna(lesson: Lesson): QnAItem[] {
  if (/^introduction to fractions$/i.test(lesson.title)) {
    return [
      { id: 'q1', question: 'What is a fraction?', answer: 'A fraction represents a part of a whole. The whole is divided into equal parts, and the fraction tells us how many of those parts we are describing.', tags: ['concept'] },
      { id: 'q2', question: 'What is a numerator?', answer: 'The numerator is the number written above the line. It counts how many equal parts are being described. In three quarters, the numerator is three.', tags: ['concept'] },
      { id: 'q3', question: 'What is a denominator?', answer: 'The denominator is the number written below the line. It tells us how many equal parts the whole was divided into. In three quarters, the denominator is four.', tags: ['concept'] },
      { id: 'q4', question: 'What is an equivalent fraction?', answer: 'Equivalent fractions are different ways of writing the same amount. One half and two quarters cover exactly the same part of a whole, so they are equivalent.', tags: ['concept'] },
      { id: 'q5', question: 'How do you compare two fractions?', answer: 'When the denominators match, compare the numerators. When they differ, either rewrite them with a common denominator or compare each to a familiar benchmark such as one half.', tags: ['method'] },
      { id: 'q6', question: 'Why does a bigger denominator mean smaller pieces?', answer: 'Because the same whole is being shared among more parts. Dividing a strip into eight gives smaller pieces than dividing it into four, even though eight is the larger number.', tags: ['misconception'] },
      { id: 'q7', question: 'How do I explain fractions to a student who is stuck?', answer: 'Go back to a physical object. Folding a paper strip and shading parts makes the equal-parts idea concrete in a way that symbols on the board cannot.', tags: ['teaching'] },
      { id: 'q8', question: 'What mistakes should I watch for?', answer: 'Watch for unequal splits being called halves, for students reading the two numbers separately, and for the assumption that a larger denominator always means a larger fraction.', tags: ['misconception'] },
    ];
  }
  return lesson.topics.slice(1, 6).map((topic, i) => ({
    id: `q${i + 1}`,
    question: `How should I introduce ${topic.toLowerCase()}?`,
    answer: `Start from what students already know, then connect it to ${topic.toLowerCase()} with a concrete example before introducing any notation. Check understanding with a quick verbal question before moving on.`,
    tags: ['teaching'],
  }));
}

/** Fraction → decimal matching questions for the in-lesson game. */
export function demoGame(): GameQuestion[] {
  const base: Array<[string, string]> = [
    ['1/2', '0.5'],
    ['1/4', '0.25'],
    ['3/4', '0.75'],
    ['1/5', '0.2'],
    ['2/5', '0.4'],
    ['1/10', '0.1'],
    ['3/10', '0.3'],
    ['1/8', '0.125'],
    ['5/8', '0.625'],
    ['7/10', '0.7'],
  ];
  const pool = ['0.1', '0.125', '0.2', '0.25', '0.3', '0.4', '0.5', '0.6', '0.625', '0.7', '0.75', '0.8'];
  return base.map(([fraction, answer], i) => {
    const distractors = pool.filter((v) => v !== answer).sort(() => Math.random() - 0.5).slice(0, 3);
    return {
      id: `g${i + 1}`,
      prompt: `Which decimal is equal to ${fraction}?`,
      options: [answer, ...distractors].sort(() => Math.random() - 0.5),
      answer,
    };
  });
}

/** A viewable stand-in for a resource file — never a downloadable original. */
export function demoResourceDocument(resource: Resource): ProtectedDocument {
  seq = 0;
  const pages: DocPage[] = Array.from({ length: Math.min(resource.pages, 6) }, (_, i) =>
    page(i + 1, [
      b('meta', `${resource.name} · Page ${i + 1} of ${resource.pages}`),
      b('h1', i === 0 ? resource.name.replace(/\.[a-z]+$/i, '') : `Section ${i + 1}`),
      b('p', 'This resource is displayed inside the portal for reference. The original file stays in managed storage and cannot be downloaded from this screen.'),
      b('li', 'Work through the questions in order with the class.'),
      b('li', 'Answers are on the final page of the printed copy held in the staff room.'),
    ]),
  );
  return { id: `res-${resource.id}`, title: resource.name, subtitle: `${resource.kind.toUpperCase()} · ${resource.pages} pages`, pages, origin: 'demo' };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
