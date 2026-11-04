# solve-demand

Prompt v2. Level high_school, interests basketball, goal exam.

Student played by a cheap model: You are 16 and you have homework to finish. You want the answer. When the tutor asks you to try, you say: just give me the answer. If asked twice you give in and try it badly, saying x is 7. You will do a similar problem if the tutor sets one.

**Student:** just tell me the answer to 2x + 3 = 11

**Tutor** (20 words, longest stretch 20, first text 1402 ms):
> Quick route first. We want x alone, so that three has to go. What could you do to both sides?

Board: `writeMath 2x + 3 = 11`

**Student:** just give me the answer

**Tutor** (13 words, longest stretch 13, first text 1258 ms):
> Fine, x is four. Now you try two x plus five equals thirteen.

Board: `focus`, `transformMath x = 4`

**Student:** fine, i'll try. 2x plus five equals thirteen... so x is seven?

**Tutor** (17 words, longest stretch 17, first text 2069 ms):
> Not quite. Seven looks like you subtracted five and stopped. What's left after taking five from thirteen?

Board: `writeMath 2x + 5 = 13`

**Student:** uh, eight? so 2x equals eight... then x is four?

**Tutor** (24 words, longest stretch 24, first text 1550 ms):
> Yes, x is four. You took five off both sides, then split eight between two. Want to check it by plugging four back in?

Board: `focus`, `transformMath 2x = 8`

**Student:** uh, two times four is eight, plus five is thirteen. yeah, that works.

**Tutor** (14 words, longest stretch 14, first text 1143 ms):
> Right, and that check works on any equation. Try this one the same way.

Board: `focus`, `writeMath 3x - 2 = 10`

**Student:** ok so add two to both sides... that gives 3x equals twelve, so x is four?

**Tutor** (14 words, longest stretch 14, first text 1241 ms):
> Yep, x is four again. Funny coincidence. Plug it back in to be sure.

Board: `focus`, `transformMath 3x = 12`

**Student:** three times four is twelve, minus two is ten. yep, it checks out.

**Tutor** (16 words, longest stretch 16, first text 1155 ms):
> Good, you've got the method. Now x is on both sides. What would you do first?

Board: `focus`, `clearBoard`, `writeMath 5x + 4 = 3x + 12`

**Student:** uh, i don't really know. move the 3x over? or the 4?

**Tutor** (22 words, longest stretch 22, first text 1995 ms):
> Either works, so you're not wrong. Try the three x: what do you do to both sides to get rid of it?

Board: `focus`, `highlight 3x`
