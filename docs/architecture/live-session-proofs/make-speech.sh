#!/bin/sh
set -e
out="$(dirname "$0")/speech"
mkdir -p "$out"
make_speech() {
  say -v Samantha -r 170 --file-format=WAVE --data-format=LEI16@48000 -o "$out/$1.wav" "$2"
}
make_speech question "Once the ball leaves my hand, what makes it come down?"
make_speech gravity "Gravity."
make_speech interrupt "Wait, then why does it come down?"
make_speech uhhuh "Uh huh."
make_speech hmm "Hmm, let me think."
make_speech twice "It lands twice as far."
make_speech itwould "It would land"
make_speech wait "Wait."
make_speech fortytwo "Forty two."
