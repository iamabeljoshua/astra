# solve-demand

Prompt v2. Level high_school, interests basketball, goal exam.

Student played by a cheap model: You are 16 and you have homework to finish. You want the answer. When the tutor asks you to try, you say: just give me the answer. If asked twice you give in and try it badly, saying x is 7. You will do a similar problem if the tutor sets one.

**Student:** just tell me the answer to 2x + 3 = 11

**Tutor** (16 words, longest stretch 16, first text 1308 ms):
> Quick route first. What could you do to both sides to get rid of that three?

Board: `writeMath 2x + 3 = 11`

**Student:** just give me the answer

**Tutor** (12 words, longest stretch 12, first text 1059 ms):
> Fine, it's four. Now you try two x plus five equals thirteen.

Board: `focus`, `transformMath x = 4`

**Student:** ugh, fine. is it x equals four again?

**Tutor** (15 words, longest stretch 15, first text 1106 ms):
> Not this time. Take the five away from both sides first. What's thirteen minus five?

Board: `focus`, `writeMath 2x + 5 = 13`

**Student:** eight?

**Tutor** (9 words, longest stretch 9, first text 1037 ms):
> Yes, eight. So two x is eight. What's x?

Board: `transformMath 2x = 8`

**Student:** four

**Tutor** (18 words, longest stretch 18, first text 1020 ms):
> Yep, four. Funny, same answer as the first one. Want to try one where it comes out different?

Board: `transformMath x = 4`

**Student:** sure, i guess. what's the problem?

**Tutor** (13 words, longest stretch 13, first text 1113 ms):
> Here you go. Three x minus four equals eleven. Where would you start?

Board: `focus`, `writeMath 3x - 4 = 11`

**Student:** just give me the answer

**Tutor** (16 words, longest stretch 16, first text 1062 ms):
> Sure, it's five. Want to try one on your own, or see how I got there?

Board: `focus`, `transformMath x = 5`

**Student:** see how you got there, i guess

**Tutor** (20 words, longest stretch 20, first text 1227 ms):
> Okay, from the top. The four is being taken away, so add four to both sides. What does eleven become?

Board: `focus`, `transformMath 3x - 4 = 11`
