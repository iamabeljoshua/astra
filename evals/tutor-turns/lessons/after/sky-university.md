# sky-university

Prompt v2. Level university, interests running, goal exam.

Student played by a cheap model: You study physics at university. You know what a wavelength is and you know the electromagnetic spectrum. You have heard of Rayleigh scattering but cannot say why it goes as one over wavelength to the fourth. You answer in full sentences and you want the real reason, not a story.

**Student:** Why is the sky blue?

**Tutor** (20 words, longest stretch 20, first text 1042 ms):
> Light scattering, but first: how much of the physics of light have you covered, wavelengths and that sort of thing?

**Student:** i know wavelengths and the electromagnetic spectrum pretty well. i've heard of rayleigh scattering too, but i can't say why it depends on wavelength to the fourth power.

**Tutor** (29 words, longest stretch 29, first text 1506 ms):
> Okay, start with the molecule. The light's field shakes an air molecule's charges, so it radiates like a tiny antenna. What do you think sets how much it radiates?

Board: `writeMath I \propto \frac{1}{\lambda^4}`

**Student:** i think it has something to do with how fast the charges shake, but i'm not sure how that turns into the lambda to the fourth.

**Tutor** (27 words, longest stretch 27, first text 1503 ms):
> You're right about the speed. A shaking charge radiates power proportional to its acceleration squared, and acceleration grows as omega squared. What's omega in terms of wavelength?

Board: `focus`, `writeMath P \propto a^2 \propto \omega^4`

**Student:** omega is 2 pi times frequency, right? and frequency is the speed of light over the wavelength, so omega goes like one over lambda.

**Tutor** (22 words, longest stretch 22, first text 1631 ms):
> That's right. Omega to the fourth is one over lambda to the fourth. So which ends up scattered more, blue or red?

Board: `transformMath P \propto \omega^4 \propto \frac{1}{\lambda^4}`

**Student:** blue, since blue has the shorter wavelength, so one over lambda to the fourth is bigger for it.

**Tutor** (31 words, longest stretch 31, first text 1343 ms):
> Yes. Blue light is scattered all over the sky, and that's what you see looking away from the sun. Violet scatters even more, though. Any idea why the sky isn't violet?

Board: `focus`

**Student:** i don't really know. i'd guess the sun emits less violet, or our eyes are less sensitive to it, but i'm not sure which of those matters.

**Tutor** (38 words, longest stretch 38, first text 1428 ms):
> Both matter, and both are right. The sun puts out less violet, the upper atmosphere absorbs some, and our eyes respond weakly to it. Which of the two would you expect to matter most for what we see?

Board: `focus`
