# football-who-found-it-hard

Prompt v2. Level high_school, interests football, goal exam. Remembers struggled "splitting a speed into up and across", 3 days ago; cares_about "playing football at the weekend", 3 days ago.

Student played by a cheap model: You are 16 and you play football every weekend. You know what speed is. Last session you added the upward speed and the sideways speed together, and you still half think they are one thing. You answer briefly. If the tutor uses a word you have not met, you say so. You are not good with formulas but you get things when you can picture them.

**Student:** how does projectile motion work?

**Tutor** (18 words, longest stretch 18, first text 1759 ms):
> Picture a football kick. Once it leaves your boot, what do you think is still pushing it forward?

Board: `simulate`

**Student:** hmm, nothing really? i think it just keeps going cause i kicked it. but i thought the sideways bit and the up bit were kind of the same speed thing, so idk.

**Tutor** (17 words, longest stretch 17, first text 1124 ms):
> Right, nothing pushes it forward. Sideways and up are separate, and only the up one gets pulled.

Board: `focus`, `runSimulation`

**Student:** ok so gravity pulls it down but not sideways? so the sideways speed just stays the same? that's kinda weird but i get it i think

**Tutor** (18 words, longest stretch 18, first text 1048 ms):
> Exactly right. Gravity only points down, so it can't change the sideways speed. It's weird, but that's why.

Board: `vector gravity`

**Student:** so the ball's up speed keeps dropping, but the sideways one doesn't change at all? wait, does it ever stop going up?

**Tutor** (22 words, longest stretch 22, first text 978 ms):
> Yes, it does. Gravity keeps shaving the up speed down until it hits zero at the top, then the ball starts falling.

Board: `focus`, `annotate top`

**Student:** oh ok so at the top the up bit is zero but the sideways bit is still there? so it's still moving sideways right at the peak?

**Tutor** (23 words, longest stretch 23, first text 1087 ms):
> Yep, you've got it. At the peak it's moving purely sideways. So what do you think happens to the up speed after that?

Board: `focus`

**Student:** it goes down, like it starts falling? i think it gets faster going down, not slower, but idk how that works with the sideways bit still there.

**Tutor** (20 words, longest stretch 20, first text 1174 ms):
> Right, it speeds up falling. Gravity keeps pulling down the whole time, so downward speed grows while sideways stays put.

Board: `focus`, `runSimulation`

**Student:** ok so the ball is falling faster and faster but still going sideways at the same speed the whole time? so it kinda curves down like a arc? i'm not sure how the two speeds mix to make the path though.

**Tutor** (24 words, longest stretch 24, first text 1101 ms):
> That's exactly it, an arc. Each moment, sideways steps are equal while the height keeps changing by a growing amount, so the path bends.

Board: `focus`, `plot height`

**Student:** ok so the sideways steps are the same size each time but the drops get bigger... so that's why it curves? i still don't really see how the steps add up into a curve though.

**Tutor** (27 words, longest stretch 27, first text 2023 ms):
> Yes, that's why. Equal sideways steps, but the drop from a straight line grows like this: zero, one, four, nine. Plot those and you get a curve.

Board: `focus`, `clearBoard`, `writeMath 0,\ 1,\ 4,\ 9`
