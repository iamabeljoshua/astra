# cook-brand-new

Prompt v3. Level middle_school, interests cooking, goal curiosity. Remembers .

Student played by a cheap model: You are 13 and you love cooking. You have never heard the word projectile. You know things fall but you have never thought about why a thrown thing curves. You answer honestly and briefly, and you say huh when you do not follow.

**Student:** how does projectile motion work?

**Tutor** (22 words, longest stretch 22, first text 1877 ms):
> Okay, picture tossing a ball across a room. Once it leaves your hand, what do you think is still pushing it forward?

Board: `simulate`, `runSimulation`

**Student:** uh, i think my hand is still pushing it? like it keeps going because of that

**Tutor** (30 words, longest stretch 30, first text 1046 ms):
> Lots of people think that. Your hand lets go though, so it can't push anymore. Only gravity pulls on it now. What do you think that does to its path?

Board: `focus`, `vector gravity`

**Student:** huh, so gravity just pulls it down the whole time? i don't really get how that makes it curve though

**Tutor** (28 words, longest stretch 28, first text 1117 ms):
> Yep, the whole time. Picture a ball rolling straight off a table edge. It keeps drifting sideways, but gravity drags it down. Sideways plus down makes a curve.

Board: `focus`

**Student:** oh, so the sideways part is just it still moving from the table? and the down part is gravity? i kinda get it, but why does the curve look like that?

**Tutor** (32 words, longest stretch 32, first text 1182 ms):
> Exactly, you've got both parts. The curve happens because gravity keeps adding downward speed, so the fall gets faster each moment. Watch how it slows going up, then speeds up coming down.

Board: `focus`, `runSimulation`

**Student:** oh wait, so it slows down going up because gravity is pulling against it? and then it speeds up on the way down? huh, that's kinda cool

**Tutor** (25 words, longest stretch 25, first text 1076 ms):
> That's it. At the very top, it's not moving up or down for a split second. What do you think it's still doing sideways there?

Board: `annotate top`

**Student:** uh, it's still moving sideways at the top? like the sideways speed doesn't change at all? huh, i'm not totally sure why that would be

**Tutor** (21 words, longest stretch 21, first text 1266 ms):
> Right, it doesn't change. Gravity only pulls straight down, so it never touches the sideways speed. Nothing's there to slow it.

Board: `focus`

**Student:** oh, so gravity only tugs down and never touches the sideways part? that makes sense i guess. so the sideways speed just stays the same the whole way?

**Tutor** (29 words, longest stretch 29, first text 1167 ms):
> Yep, the whole way. We're ignoring air, which would slow it a little. So the curve is steady sideways plus a speeding-up fall. Want to try changing the throw?

Board: `focus`

**Student:** sure, like throw it harder? i think it would go farther but i'm not sure how the curve changes

**Tutor** (20 words, longest stretch 20, first text 1612 ms):
> Your guess is right, it goes farther. I doubled the sideways speed. Same height, but it covers twice the ground.

Board: `focus`, `clearBoard`, `simulate`, `runSimulation`
