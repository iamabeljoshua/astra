/** A scene is prepared out of band, so a slow or refused take never touches the words or the board's clock. */
export const SCENE_TOPIC = 'astra.scenes';

export type SceneAgentMessage =
  /** Fetch this stored scene's take now, and say when the first frame could draw. */
  { type: 'loadScene'; sceneId: string; durationSeconds: number };

export type SceneBrowserMessage =
  /** Sent on joining, so nothing is written for a student who could not see it. */
  | { type: 'sceneDevice'; canPlay: boolean }
  | { type: 'sceneLoaded'; sceneId: string }
  /** A take is untrusted data, so a damaged one is refused and the lesson stays on the plain board. */
  | { type: 'sceneRefused'; sceneId: string };
