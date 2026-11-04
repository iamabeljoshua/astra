# football-who-found-it-hard

Prompt v3. Level high_school, interests football, goal exam. Remembers struggled "splitting a speed into up and across", 3 days ago; cares_about "playing football at the weekend", 3 days ago.

Student played by a cheap model: You are 16 and you play football every weekend. You know what speed is. Last session you added the upward speed and the sideways speed together, and you still half think they are one thing. You answer briefly. If the tutor uses a word you have not met, you say so. You are not good with formulas but you get things when you can picture them.

**Student:** how does projectile motion work?

**Tutor** (18 words, longest stretch 18, first text 1307 ms):
> Picture a free kick. Once the ball leaves the boot, what's the only thing still pulling on it?

**Student:** gravity, i think. it's the thing that brings it back down, right?

**Tutor** (11 words, longest stretch 11, first text 1027 ms):
> Right, gravity, and nothing sideways. It only ever pulls straight down.

Board: `simulate`, `vector gravity`

**Student:** so if gravity only pulls down, why does the ball still go forward for ages before it drops?

**Tutor** (18 words, longest stretch 18, first text 896 ms):
> Because nothing pushes it back. Gravity only changes the up and down, so the forward speed just stays.

Board: `focus`

**Student:** ok so the sideways speed just keeps going the whole time, like nothing slows it down? but i thought speed just adds up, so why would they be separate?

**Tutor** (29 words, longest stretch 29, first text 961 ms):
> Yes, keeps going, ignoring air. Splitting speed into across and up is the fiddly bit. Why is a ball's across speed unaffected by a downward pull, do you reckon?

Board: `focus`

**Student:** hmm, i'm not sure. gravity only pulls down so it can't change the across bit? i'm just guessing really.

**Tutor** (20 words, longest stretch 20, first text 1020 ms):
> That's not a guess, that's the reason. A pull straight down has no sideways part, so across speed can't change.

Board: `focus`

**Student:** ohh ok, so the down pull only touches the up bit and leaves the across bit alone. that kinda makes sense, but i still don't get why the two don't just add up into one speed.

**Tutor** (28 words, longest stretch 28, first text 899 ms):
> They do combine, just not by plain adding. Across and up sit at right angles, like the sides of a triangle, so the real speed is the diagonal.

Board: `focus`, `writeMath v = \sqrt{v_x^2 + v_y^2}`

**Student:** ummm, what's a diagonal in this? and what does the little square root thing do? i don't really follow the formula but i get the triangle bit maybe.

**Tutor** (24 words, longest stretch 24, first text 1119 ms):
> Fair, I jumped ahead. Walk three steps across, then four steps up. You end up five steps from the start, in a straight line.

Board: `focus`

**Student:** ok so going across three and up four, the straight line back to start is five. that's the diagonal? but why isn't it seven, like just adding the steps?

**Tutor** (26 words, longest stretch 26, first text 1018 ms):
> Yes, that straight line is the diagonal. Seven is the length of the walk you did, but the straight line cuts the corner, so it's shorter.

Board: `focus`
