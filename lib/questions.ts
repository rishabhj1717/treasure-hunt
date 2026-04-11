export type JinGyanQuestionOption = {
  id: string;
  label: string;
};

export type JinGyanQuestion = {
  id: string;
  prompt: string;
  options: JinGyanQuestionOption[];
  correctOptionId: string;
};

export const QUESTIONS: JinGyanQuestion[] = [
  {
    id: "q1",
    prompt: "I have keys but no locks, I have space but no rooms. What am I?",
    options: [
      { id: "a", label: "Keyboard" },
      { id: "b", label: "Lockbox" },
      { id: "c", label: "Map" },
      { id: "d", label: "Piano" }
    ],
    correctOptionId: "a"
  },
  {
    id: "q2",
    prompt: "What gets wetter while drying?",
    options: [
      { id: "a", label: "Sun" },
      { id: "b", label: "Towel" },
      { id: "c", label: "Sand" },
      { id: "d", label: "Cloud" }
    ],
    correctOptionId: "b"
  },
  {
    id: "q3",
    prompt: "What has to be broken before you can use it?",
    options: [
      { id: "a", label: "Stone" },
      { id: "b", label: "Code" },
      { id: "c", label: "Egg" },
      { id: "d", label: "Bottle" }
    ],
    correctOptionId: "c"
  },
  {
    id: "q4",
    prompt: "I speak without a mouth and hear without ears. What am I?",
    options: [
      { id: "a", label: "Shadow" },
      { id: "b", label: "Echo" },
      { id: "c", label: "Mirror" },
      { id: "d", label: "Clock" }
    ],
    correctOptionId: "b"
  }
];
