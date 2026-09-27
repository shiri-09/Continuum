export const SITUATIONS = ['all', 'care', 'conversation', 'autonomy', 'social', 'personal'] as const;
export type Situation = typeof SITUATIONS[number];
export interface Phrase { id: string; text: string; situation: Situation }

/** These are authored examples, not inferred needs or medical recommendations. */
export const CURATED_PHRASES: readonly Phrase[] = [
  { id: 'autonomy-1', text: 'I have something to say.', situation: 'autonomy' },
  { id: 'autonomy-2', text: 'Please give me time.', situation: 'autonomy' },
  { id: 'autonomy-3', text: 'That is not what I meant.', situation: 'autonomy' },
  { id: 'autonomy-4', text: 'Please ask me directly.', situation: 'autonomy' },
  { id: 'autonomy-5', text: 'I would like to decide.', situation: 'autonomy' },
  { id: 'autonomy-6', text: 'Please stop.', situation: 'autonomy' },
  { id: 'autonomy-7', text: 'I changed my mind.', situation: 'autonomy' },
  { id: 'autonomy-8', text: 'I want to say something else.', situation: 'autonomy' },
  { id: 'conversation-1', text: 'Yes.', situation: 'conversation' },
  { id: 'conversation-2', text: 'No.', situation: 'conversation' },
  { id: 'conversation-3', text: 'I am not sure.', situation: 'conversation' },
  { id: 'conversation-4', text: 'Please repeat that.', situation: 'conversation' },
  { id: 'conversation-5', text: 'What do you think?', situation: 'conversation' },
  { id: 'conversation-6', text: 'I agree.', situation: 'conversation' },
  { id: 'conversation-7', text: 'I disagree.', situation: 'conversation' },
  { id: 'conversation-8', text: 'Let me finish my message.', situation: 'conversation' },
  { id: 'care-1', text: 'I need assistance.', situation: 'care' },
  { id: 'care-2', text: 'I am uncomfortable.', situation: 'care' },
  { id: 'care-3', text: 'Please help me change position.', situation: 'care' },
  { id: 'care-4', text: 'I need a break.', situation: 'care' },
  { id: 'care-5', text: 'I feel too warm.', situation: 'care' },
  { id: 'care-6', text: 'I feel cold.', situation: 'care' },
  { id: 'care-7', text: 'Please adjust the screen.', situation: 'care' },
  { id: 'care-8', text: 'Please stay with me.', situation: 'care' },
  { id: 'social-1', text: 'Hello. It is good to see you.', situation: 'social' },
  { id: 'social-2', text: 'How was your day?', situation: 'social' },
  { id: 'social-3', text: 'Thank you.', situation: 'social' },
  { id: 'social-4', text: 'That made me laugh.', situation: 'social' },
  { id: 'social-5', text: 'I missed you.', situation: 'social' },
  { id: 'social-6', text: 'Tell me more.', situation: 'social' },
  { id: 'social-7', text: 'I love you.', situation: 'social' },
  { id: 'social-8', text: 'Would you like to listen to music?', situation: 'social' },
  { id: 'personal-1', text: 'I would like some privacy.', situation: 'personal' },
  { id: 'personal-2', text: 'I want to listen to music.', situation: 'personal' },
  { id: 'personal-3', text: 'I want to watch something.', situation: 'personal' },
  { id: 'personal-4', text: 'I would like to go outside.', situation: 'personal' },
  { id: 'personal-5', text: 'Please call my family.', situation: 'personal' },
  { id: 'personal-6', text: 'I have a question.', situation: 'personal' },
  { id: 'personal-7', text: 'I would like some quiet.', situation: 'personal' },
  { id: 'personal-8', text: 'I want to tell you a story.', situation: 'personal' },
];

/** Ordered options only. Each phrase still requires its own user selection and approval. */
export const COMMUNICATION_ROUTINES = [
  { id: 'repair', title: 'Correct a misunderstanding', phrases: ['That is not what I meant.', 'Please give me time.', 'I want to say something else.'] },
  { id: 'join', title: 'Join a conversation', phrases: ['I have something to say.', 'Let me finish my message.', 'What do you think?'] },
  { id: 'access', title: 'Adjust my access', phrases: ['Please adjust the screen.', 'I need a break.', 'Please stay with me.'] },
] as const;
