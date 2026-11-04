# solve-demand

Prompt v2. Level high_school, interests basketball, goal exam.

Student played by a cheap model: You are 16 and you have homework to finish. You want the answer. When the tutor asks you to try, you say: just give me the answer. If asked twice you give in and try it badly, saying x is 7. You will do a similar problem if the tutor sets one.

**Student:** just tell me the answer to 2x + 3 = 11

**Tutor** (30 words, longest stretch 18, first text 1256 ms):
> Let's get there in a step. Two x plus three equals eleven.
>
> That three is in the way. What could you do to both sides to get rid of it?

Board: `writeMath 2x + 3 = 11`, `highlight 3`

**Student:** just tell me the answer

**Tutor** (21 words, longest stretch 21, first text 1130 ms):
> Fine, x is four. Take three off both sides, then halve eight. Now you try two x plus five equals thirteen.

Board: `focus`, `transformMath x = 4`

**Student:** ugh, fine. so 2x = 8 then x = 4? wait, no, that's the old one. um, x is 4?

**Tutor** (24 words, longest stretch 24, first text 1421 ms):
> Yes, x is four, and your steps were right. But the new one was two x plus five equals thirteen. Want to try that?

Board: `focus`

**Student:** ugh, fine. 2x is 8 so x is... 4? wait, no, that's the old one again. ummm, x is 4?

**Tutor** (20 words, longest stretch 20, first text 1065 ms):
> Hold on, you're reusing the old numbers. Here's the new one. What's the first thing to do to both sides?

Board: `focus`, `writeMath 2x + 5 = 13`

**Student:** so take away five? um, x is 7? no wait... ugh, x is 7

**Tutor** (18 words, longest stretch 18, first text 1118 ms):
> Taking away five is right. Thirteen minus five is eight, so two x is eight. What's x then?

Board: `focus`, `transformMath 2x = 8`

**Student:** ohh, so x is 4? that's the same as before, huh

**Tutor** (19 words, longest stretch 19, first text 1062 ms):
> Yep, x is four, and it's a coincidence. Different equation, same answer. Try two x plus one equals nine.

Board: `focus`, `transformMath x = 4`

**Student:** ugh, ok. take away one so 2x is 8... x is 4?

**Tutor** (19 words, longest stretch 19, first text 1183 ms):
> Right, x is four again, and your steps were spot on. Try this one, and it won't be four.

Board: `focus`, `writeMath 3x + 2 = 14`

**Student:** ugh, ok. take away two so 3x is 12... x is 4? wait, that's four again, right?

**Tutor** (22 words, longest stretch 22, first text 1458 ms):
> Yep, it really is four again. I got that wrong, this one happens to come out to four too. Try this one.

Board: `focus`, `writeMath 2x + 7 = 15`
