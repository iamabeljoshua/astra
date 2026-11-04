# football-who-found-it-hard

Prompt v2. Level high_school, interests football, goal exam. Remembers struggled "splitting a speed into up and across", 3 days ago; cares_about "playing football at the weekend", 3 days ago.

Student played by a cheap model: You are 16 and you play football every weekend. You know what speed is. Last session you added the upward speed and the sideways speed together, and you still half think they are one thing. You answer briefly. If the tutor uses a word you have not met, you say so. You are not good with formulas but you get things when you can picture them.

**Student:** how does projectile motion work?

**Tutor** (21 words, longest stretch 21, first text 1685 ms):
> Picture a football kicked off the ground. Once it leaves your foot, what do you think is still pushing it forward?

**Student:** nothing, i reckon? my foot's not touching it anymore so it should just stop going forward, right?

**Tutor** (23 words, longest stretch 23, first text 2599 ms):
> Half right. Nothing is pushing it forward, but it doesn't stop. Watch the ball's sideways speed. Does it slow down as it flies?

Board: `simulate`

**Student:** hmm, i think it does slow down a bit? like it doesnt zoom off the whole way. but i dont get why it keeps going if nothing's pushing it.

**Tutor** (24 words, longest stretch 24, first text 1876 ms):
> Think of a puck sliding on ice. It keeps gliding because nothing's slowing it, and the air here barely does. Does that sound fair?

Board: `focus`, `runSimulation`

**Student:** kinda, yeah. like on ice it just keeps sliding. but a ball on grass stops, so something must be slowing it down, right?

**Tutor** (24 words, longest stretch 24, first text 2593 ms):
> Exactly, grass rubs against it. That rubbing has a name, friction. In the air there's almost none, so the sideways speed stays the same.

Board: `focus`

**Student:** oh ok, so in the air the sideways speed just stays the same? what about the up and down bit then, does that stay the same too?

**Tutor** (27 words, longest stretch 27, first text 1784 ms):
> That's it for sideways. Up and down is different. Gravity's pulling the ball down the whole time. What do you think that does to its upward speed?

Board: `focus`, `vector gravity`

**Student:** hmm, gravity pulls it down so the upward speed gets smaller? like it slows down going up. but i thought the upward speed and sideways speed kinda just add up into one speed, is that wrong?

**Tutor** (34 words, longest stretch 30, first text 1327 ms):
> You're right about the upward speed shrinking. On adding, they combine, but not like plain adding. They're separate directions, so the ball's real speed is along the slant between them.
>
> Want to see that?

Board: `focus`

**Student:** yeah go on, but can you keep it simple? i get pictures better than sums.

**Tutor** (20 words, longest stretch 20, first text 1250 ms):
> Picture walking across a field. Walk four steps east, then three north. You've ended up five steps away, not seven.

Board: `focus`, `diagram`

**Student:** ohh, so you don't just add them, the walk's a diagonal? that's kinda weird but i get it. so the ball's speed is the slant, not the two bits added together?

**Tutor** (30 words, longest stretch 30, first text 2223 ms):
> Yes, that's it. The slant is the ball's real speed, and the sideways and upward bits are its two parts. That's what tripped you up before, so you've fixed it.

Board: `focus`
