// The shared musical grid. music.json is the only source of these numbers.
import music from "../../music.json";

export type Mood = (typeof music.moods)[number];
export const MUSIC = music;
export const MOODS = music.moods as [string, ...string[]];
export const BEAT_SECONDS = 60 / music.bpm;
export const MAX_ROOM_SIZE = 20;
