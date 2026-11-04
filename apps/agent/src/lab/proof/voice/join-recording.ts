import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Page } from 'playwright';

// Playwright's video has no sound, so the page's own recording joins it, at the moment each one started.
export async function saveRecording({ page, videoStartedEpochMs, outputPath }: { page: Page; videoStartedEpochMs: number; outputPath: string }): Promise<void> {
  const audio = await page.evaluate(() => window.speechInPage.stopRecording());
  const video = page.video();
  await page.close();
  const videoPath = await video?.path();
  if (!audio || !videoPath) throw new Error('nothing to join');
  const audioPath = `${outputPath}.webm`;
  writeFileSync(audioPath, Buffer.from(audio.base64, 'base64'));
  const delayMs = Math.max(0, Math.round(audio.startedEpochMs - videoStartedEpochMs));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoPath, '-i', audioPath, '-filter_complex', `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v];[1:a]adelay=${delayMs}:all=1[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-c:a', 'aac', outputPath]);
}
