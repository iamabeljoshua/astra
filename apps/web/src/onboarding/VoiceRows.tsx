import { useEffect, useState } from 'react';
import { ONBOARDING_LABELS, TUTOR_VOICE_LABELS } from '../strings';
import { type TutorVoice, TUTOR_VOICES } from './answers';
import { prepareBrowserVoices, speak, stopSpeaking } from './browserVoice';
import { OPTION_ROW, OptionList, OptionMark } from './OptionRows';

const SOUND_BARS = 5;

interface VoiceRowsProps {
  studentName: string;
  selected: TutorVoice | null;
  onPick: (voice: TutorVoice) => void;
}

export function VoiceRows({ studentName, selected, onPick }: VoiceRowsProps) {
  const [playingVoice, setPlayingVoice] = useState<TutorVoice | null>(null);
  const [isSilent, setIsSilent] = useState(false);

  useEffect(() => {
    prepareBrowserVoices();
    return stopSpeaking;
  }, []);

  function pick(voice: TutorVoice) {
    onPick(voice);
    const canPlay = speak(ONBOARDING_LABELS.voiceSample(studentName.trim()), voice, () =>
      setPlayingVoice((current) => (current === voice ? null : current)),
    );
    setPlayingVoice(canPlay ? voice : null);
    setIsSilent(!canPlay);
  }

  return (
    <>
      <OptionList>
        {TUTOR_VOICES.map((voice) => (
          <button key={voice} type="button" aria-pressed={selected === voice} onClick={() => pick(voice)} className={`group ${OPTION_ROW} grid-cols-voice-row`}>
            <OptionMark />
            <span>
              <span className="block text-sub font-medium">{TUTOR_VOICE_LABELS[voice].name}</span>
              <span className="block text-fine text-ink-2">{TUTOR_VOICE_LABELS[voice].about}</span>
            </span>
            <SoundBars isPlaying={playingVoice === voice} />
          </button>
        ))}
      </OptionList>
      <p role="status" className="text-fine text-ink-2">{isSilent ? ONBOARDING_LABELS.voiceSilent : ONBOARDING_LABELS.voiceNote}</p>
    </>
  );
}

function SoundBars({ isPlaying }: { isPlaying: boolean }) {
  return (
    <span aria-hidden data-playing={isPlaying} className="sound-bars">
      {Array.from({ length: SOUND_BARS }, (_unused, index) => (
        <i key={index} />
      ))}
    </span>
  );
}
