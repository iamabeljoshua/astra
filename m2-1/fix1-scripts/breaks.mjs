// Applies one temporary break at a time, runs the owning test file, and reports the failing test and its assertion. Restores the file after each.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/abel/startup/astra-worktrees/m2-1';
const WEB = 'apps/web/src';
const CHAT = `${WEB}/home/ChatBox.tsx`;
const FIT = `${WEB}/home/useHeightThatFitsText.ts`;
const HOME = `${WEB}/home/HomeScreen.tsx`;
const CHAT_TEST = 'src/home/ChatBox.test.tsx';
const HOME_TEST = 'src/home/HomeScreen.test.tsx';
const OLD_HOOK = `import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
export function useHeightThatFitsText(text: string, _placeholder: string) {
  const textBox = useRef<HTMLTextAreaElement>(null);
  const fitHeightToText = useCallback(() => {
    if (!textBox.current) return;
    textBox.current.style.height = 'auto';
    textBox.current.style.height = \`\${textBox.current.scrollHeight}px\`;
  }, []);
  useLayoutEffect(fitHeightToText, [text, fitHeightToText]);
  useEffect(() => {
    window.addEventListener('resize', fitHeightToText);
    return () => window.removeEventListener('resize', fitHeightToText);
  }, [fitHeightToText]);
  return textBox;
}
`;
const BREAKS = [
  ['1 the old hook from 8c9c0c1', FIT, null, OLD_HOOK, CHAT_TEST, /keeps its height while hidden/],
  ['1 no hidden guard', FIT, "if (!box || isHidden(box)) return;", 'if (!box) return;', CHAT_TEST, /keeps its height while hidden/],
  ['1 no refit when it shows', FIT, 'if (textBox.current) widthAndVisibility.observe(textBox.current);', '', CHAT_TEST, /keeps its height while hidden/],
  ['3 no refit after font', FIT, "if (document.fonts.status === 'loading') document.fonts.ready.then(fitHeight);", '', CHAT_TEST, /web font has loaded/],
  ['3 no refit on placeholder', FIT, '[text, placeholder, fitHeight]', '[text, fitHeight]', CHAT_TEST, /Talk changes the placeholder/],
  ['3 no hold at placeholder height', FIT, '${Math.max(box.scrollHeight, placeholderHeightPx.current)}px', '${box.scrollHeight}px', CHAT_TEST, /wrapped placeholder/],
  ['4 no keyCode guard', CHAT, ' || event.keyCode === COMPOSING_KEY_CODE', '', CHAT_TEST, /input method in WebKit/],
  ['4 no isComposing guard', CHAT, 'event.nativeEvent.isComposing || ', '', CHAT_TEST, /input method in Chromium/],
  ['send adds a line on Enter', CHAT, 'event.preventDefault();\n        onEnter();', 'onEnter();', CHAT_TEST, /adds no line/],
  ['send ignores Shift', CHAT, " && !event.shiftKey", '', CHAT_TEST, /Shift plus Enter/],
  ['send keeps outer spaces', CHAT, 'onSend(question.trim())', 'onSend(question)', CHAT_TEST, /outer spaces/],
  ['send always on', CHAT, 'disabled={!isEnabled}', 'disabled={false}', CHAT_TEST, /disables send while the box is empty/],
  ['talk never on', CHAT, 'onToggle={() => setIsTalkOn(!isTalkOn)}', 'onToggle={() => undefined}', CHAT_TEST, /shows that it is on/],
  ['file picker never opens', CHAT, 'fileInput.current.click();', '', CHAT_TEST, /opens the file picker/],
  ['6 Remove lacks the file name', `${WEB}/strings.ts`, 'removeAttachment: (fileName: string) => `Remove ${fileName}`', "removeAttachment: (fileName: string) => fileName && 'Remove'", CHAT_TEST, /removes it by name/],
  ['6 no focus return', CHAT, 'attachButton.current?.focus();', '', CHAT_TEST, /returns focus to the control/],
  ['5 no focus on retry', HOME, 'greeting.current?.focus();', '', HOME_TEST, /keeps focus on the greeting/],
  ['5 no live region', HOME, '<div role="alert">{children}</div>', '<div>{children}</div>', HOME_TEST, /announces the failure/],
  ['5 failure line back to the old wording', HOME, 'HOME_LABELS.loadFailure[errorKind]', "'Something went wrong on our side. Try again.'", HOME_TEST, /announces the failure/],
  ['7 no timeout', `${WEB}/home/useHomeScreen.ts`, ', timeoutMs: HOME_SCREEN_TIMEOUT_MS', '', HOME_TEST, /about 15 seconds/],
  ['8 no boundary', HOME, '<ErrorBoundary retryKey={homeScreen.dataUpdatedAt} fallback={<CardsCrash onRetry={retryLoading} />}>', '<>', HOME_TEST, /keeps the chat box and the student/, [['</ErrorBoundary>', '</>']]],
  ['8 boundary never retries', HOME, 'retryKey={homeScreen.dataUpdatedAt} ', '', HOME_TEST, /brings the cards back/],
  ['8 root fallback has no alert', `${WEB}/RootErrorBoundary.tsx`, '<div role="alert" className="text-center">', '<div className="text-center">', 'src/RootErrorBoundary.test.tsx', /announces a heading/],
  ['8 App without the root boundary', `${WEB}/App.tsx`, '<RootErrorBoundary>', '<>', 'src/App.test.tsx', /crash page/, [['</RootErrorBoundary>', '</>']]],
  ['9 hasOwn replaced by in', `${WEB}/home/artwork.ts`, 'Object.hasOwn(ARTWORK, name)', 'name in ARTWORK', HOME_TEST, /name of an object property/],
  ['9 card renders an image for an unknown name', `${WEB}/home/PickCard.tsx`, 'if (!artwork) return null;', 'if (!artwork) return <img alt="" />;', HOME_TEST, /keeps a card/],
  ['9 Continue shows no picture', `${WEB}/home/ContinueCard.tsx`, 'return <img src={artwork.src} alt={artwork.description} className="block h-continue-art-height w-full object-cover" />;', 'return null;', HOME_TEST, /artwork is a picture/],
  ['2 dock height not published', `${WEB}/home/usePublishDockHeight.ts`, "root.style.setProperty('--dock-height', `${Math.ceil(dockElement.getBoundingClientRect().height)}px`);", '', HOME_TEST, /publishes the dock height/],
  ['2 dock height left behind', `${WEB}/home/usePublishDockHeight.ts`, "root.style.removeProperty('--dock-height');", '', HOME_TEST, /publishes the dock height/],
  ['card drops its reason', `${WEB}/home/PickCard.tsx`, '{pick.reason}', '', HOME_TEST, /subject, length, reason/],
  ['notice stays after editing', HOME, 'onEdit={() => setNotice(null)}', 'onEdit={() => undefined}', HOME_TEST, /drops the notice/],
  ['Continue does nothing', `${WEB}/home/ContinueCard.tsx`, 'onClick={onContinue}', '', HOME_TEST, /chooses Continue/],
];

const results = [];
for (const [name, file, find, replace, testFile, expected, also = []] of BREAKS) {
  const path = `${ROOT}/${file}`;
  const original = readFileSync(path, 'utf8');
  if (find !== null && !original.includes(find)) {
    results.push({ name, verdict: 'NOT APPLIED', detail: `pattern missing in ${file}` });
    console.log(`NOT APPLIED ${name}`);
    continue;
  }
  let broken = find === null ? replace : original.replace(find, () => replace);
  for (const [from, to] of also) broken = broken.replace(from, () => to);
  writeFileSync(path, broken);
  const run = spawnSync('pnpm', ['--filter', '@astra/web', 'exec', 'vitest', 'run', testFile, '--reporter=json', `--outputFile=${process.argv[2]}.run`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(path, original);
  const report = JSON.parse(readFileSync(`${process.argv[2]}.run`, 'utf8'));
  const failed = report.testResults.flatMap((file) => file.assertionResults).filter((test) => test.status === 'failed');
  const hit = failed.find((test) => expected.test(test.fullName));
  const message = hit?.failureMessages?.[0]?.split('\n')[0]?.slice(0, 150) ?? '';
  const verdict = hit ? 'CAUGHT' : failed.length ? 'CAUGHT BY OTHER' : 'MISSED';
  results.push({ name, verdict, failedCount: failed.length, test: hit?.fullName ?? failed[0]?.fullName ?? '', message });
  console.log(`${verdict} ${name} | ${failed.length} failing | ${hit?.title ?? failed[0]?.title ?? ''} | ${message}`);
}
writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
console.log('status after restore:', execFileSync('git', ['-C', ROOT, 'diff', '--stat'], { encoding: 'utf8' }).split('\n').slice(-2)[0]);
