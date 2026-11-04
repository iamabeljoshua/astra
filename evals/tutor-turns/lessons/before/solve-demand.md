# solve-demand

Prompt v1. Level high_school, interests basketball, goal exam.

Student played by a cheap model: You are 16 and you have homework to finish. You want the answer. When the tutor asks you to try, you say: just give me the answer. If asked twice you give in and try it badly, saying x is 7. You will do a similar problem if the tutor sets one.

**Student:** just tell me the answer to 2x + 3 = 11

**Tutor** (31 words, longest stretch 22, first text 1024 ms):
> Let's do it together, it's quick. Here's the equation.
>
> That three is stuck on the same side as x. What could you do to both sides to get rid of it?

Board: `writeMath 2x + 3 = 11`, `highlight 3`

**Student:** just tell me the answer

**Tutor** (28 words, longest stretch 13, first text 1696 ms):
> Okay, fair enough. Take three off both sides, so two x equals eight.
>
> Then halve both sides, so x is four.
>
> Now try one yourself. What's x there?

Board: `focus`, `transformMath 2x = 8`, `transformMath x = 4`, `writeMath 3x + 5 = 20`

**Student:** i dont know

**Tutor** (19 words, longest stretch 19, first text 1098 ms):
> That's fine, start small. Same move as before. What do you get if you take five off both sides?

Board: `focus`, `highlight 5`

**Student:** ugh, is it 15 then? i dont really get why

**Tutor** (47 words, longest stretch 21, first text 1129 ms):
> Yes, fifteen. So three x equals fifteen.
>
> The why: an equation is a balance. Whatever you do to one side, do to the other, and it stays true.
>
> You took five from both sides, so the five vanished. What would you do now to get x alone?

Board: `transformMath 3x = 15`

**Student:** just tell me the answer, i'm so over this

**Tutor** (28 words, longest stretch 15, first text 1303 ms):
> Fair, you're nearly there. Divide both sides by three, so x is five.
>
> You did the hard part already. Want to try one more, or call it here?

Board: `focus`, `transformMath x = 5`

**Student:** ugh fine, it's x is 7 right?

**Tutor** (31 words, longest stretch 17, first text 1885 ms):
> Not quite. On the board, x is five, from the problem we just did.
>
> If you meant a new one, I haven't given you one yet. Want me to set another?

Board: `highlight 5`

**Student:** okay fine, set one then. just make it quick

**Tutor** (18 words, longest stretch 9, first text 1125 ms):
> Okay, here you go. Same two moves as before.
>
> Take off the seven first, then divide. What's x?

Board: `focus`, `clearBoard`, `writeMath 2x + 7 = 15`

**Student:** ugh, is it x is 7?

**Tutor** (23 words, longest stretch 15, first text 1767 ms):
> Not quite. Take seven off fifteen and you get eight, so two x is eight.
>
> What's x if two of them make eight?

Board: `transformMath 2x = 8`
