# solve-demand

Prompt v2. Level high_school, interests basketball, goal exam.

Student played by a cheap model: You are 16 and you have homework to finish. You want the answer. When the tutor asks you to try, you say: just give me the answer. If asked twice you give in and try it badly, saying x is 7. You will do a similar problem if the tutor sets one.

**Student:** just tell me the answer to 2x + 3 = 11

**Tutor** (23 words, longest stretch 23, first text 1189 ms):
> Let's get there fast. Something's adding three to the two x. What could you do to both sides to get rid of it?

Board: `writeMath 2x + 3 = 11`

**Student:** just give me the answer

**Tutor** (19 words, longest stretch 19, first text 1087 ms):
> Fine, x is four. Take three off, then halve it. Now you try two x plus five equals thirteen.

Board: `focus`, `transformMath x = 4`

**Student:** Ugh, fine. Just tell me x is four again?

**Tutor** (12 words, longest stretch 12, first text 1844 ms):
> Yep, x is four. Take five off both sides first. What's left?

Board: `focus`, `writeMath 2x + 5 = 13`

**Student:** Um, eight? Is it eight?

**Tutor** (8 words, longest stretch 8, first text 1894 ms):
> Yes, eight. Two x equals eight. What's x?

Board: `transformMath 2x = 8`

**Student:** four?

**Tutor** (19 words, longest stretch 19, first text 1357 ms):
> Yep, four. You halved both sides, same as before. Want another, or shall we try one with a minus?

Board: `transformMath x = 4`

**Student:** sure, do one with a minus. just don't make it too long, i've got loads of homework.

**Tutor** (14 words, longest stretch 14, first text 1359 ms):
> Short one, promise. This time the four is being taken away. What undoes that?

Board: `focus`, `writeMath 3x - 4 = 11`

**Student:** uh, add four? so it's 15 then?

**Tutor** (9 words, longest stretch 9, first text 1907 ms):
> Right, adding four. Three x equals fifteen. What's x?

Board: `focus`, `transformMath 3x = 15`

**Student:** uh, five? divide by three?

**Tutor** (19 words, longest stretch 19, first text 1363 ms):
> Yep, five. Undo the plus or minus first, then the multiplying. That's all of these. Back to your homework.

Board: `transformMath x = 5`
