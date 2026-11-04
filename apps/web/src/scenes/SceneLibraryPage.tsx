import type { components } from '@astra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { SCENE_LIBRARY_LABELS } from '../strings';
import { Button } from '../ui/Button';

type LibraryScene = components['schemas']['LibrarySceneDto'];

const SAMPLE_KEY = ['scene-library', 'sample'];
const FORBIDDEN = 403;
const MOMENT_MARK = /\[\[[^\]]*\]\]\s*/g;

export const SCENE_LIBRARY_PATH = '/scene-library';

function SheetImage({ scene }: { scene: LibraryScene }) {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    let madeAddress: string | null = null;
    let isGone = false;
    void (api.get('/scene-library/{sceneId}/sheet', { params: { path: { sceneId: scene.sceneId } }, parseAs: 'blob' }) as Promise<unknown>).then((sheet) => {
      if (isGone || !(sheet instanceof Blob)) return;
      madeAddress = URL.createObjectURL(sheet);
      setAddress(madeAddress);
    });
    return () => {
      isGone = true;
      if (madeAddress) URL.revokeObjectURL(madeAddress);
    };
  }, [scene.sceneId]);
  return address ? <img src={address} alt={SCENE_LIBRARY_LABELS.sheetAlt(scene.title)} className="w-full border border-line" /> : <div className="aspect-video w-full border border-line" />;
}

function SceneCard({ scene, seed }: { scene: LibraryScene; seed: number }) {
  const queryClient = useQueryClient();
  const { sceneId, isFlagged } = scene;
  const flag = useMutation({
    mutationFn: () => (isFlagged ? api.delete('/scene-library/{sceneId}/flag', { params: { path: { sceneId } } }) : api.put('/scene-library/{sceneId}/flag', { params: { path: { sceneId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...SAMPLE_KEY, seed] }),
  });
  return (
    <li className="flex flex-col gap-3 border-b border-line py-6">
      <h2 className="font-semibold">{scene.title}</h2>
      <p className="text-ink-2">{scene.kind === 'opening' ? SCENE_LIBRARY_LABELS.opening : SCENE_LIBRARY_LABELS.deeper} {scene.subject}. {SCENE_LIBRARY_LABELS.notChecked}</p>
      <SheetImage scene={scene} />
      <p>{scene.narration.replace(MOMENT_MARK, '')}</p>
      <p className="text-ink-2">{scene.close}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" isBusy={flag.isPending} onClick={() => flag.mutate()}>{isFlagged ? SCENE_LIBRARY_LABELS.showAgain : SCENE_LIBRARY_LABELS.flag}</Button>
        {isFlagged ? <span className="text-ink-2">{SCENE_LIBRARY_LABELS.flagged}</span> : null}
      </div>
    </li>
  );
}

/** A named reviewer's look at a sample of the library. Only the API decides who that is, so a student gets one plain line and none of the scenes. */
export function SceneLibraryPage() {
  const [seed, setSeed] = useState(0);
  const sample = useQuery({
    queryKey: [...SAMPLE_KEY, seed],
    queryFn: ({ signal }) => api.get('/scene-library/sample', { signal, params: { query: { seed } } }),
    retry: false,
  });
  if (sample.error instanceof ApiError && sample.error.status === FORBIDDEN) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 p-6">
        <p>{SCENE_LIBRARY_LABELS.notForYou}</p>
        <Link to="/" className="button button-outline">{SCENE_LIBRARY_LABELS.backHome}</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3.5">
        <h1 tabIndex={-1} className="text-title font-semibold outline-none">{SCENE_LIBRARY_LABELS.title}</h1>
        <Button variant="outline" onClick={() => setSeed((current) => current + 1)}>{SCENE_LIBRARY_LABELS.another}</Button>
      </header>
      {sample.isError ? <p className="text-ink-2">{SCENE_LIBRARY_LABELS.couldNotLoad}</p> : null}
      <ul>{sample.data?.map((scene) => <SceneCard key={scene.sceneId} scene={scene} seed={seed} />)}</ul>
    </main>
  );
}
