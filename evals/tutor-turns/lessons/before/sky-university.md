# sky-university

Prompt v1. Level university, interests running, goal exam.

Student played by a cheap model: You study physics at university. You know what a wavelength is and you know the electromagnetic spectrum. You have heard of Rayleigh scattering but cannot say why it goes as one over wavelength to the fourth. You answer in full sentences and you want the real reason, not a story.

**Student:** Why is the sky blue?

**Tutor** (50 words, longest stretch 27, first text 864 ms):
> Short version, sunlight is every color mixed together.
>
> Air molecules bounce short wavelengths, blue, far more than long ones, red. That's Rayleigh scattering, and the strength goes as one over wavelength to the fourth power.
>
> So blue light gets knocked all around the sky, and that's what reaches your eyes.

Board: `text Blue scatters the most`

**Student:** i get the basic idea that blue gets scattered more. but why exactly one over wavelength to the fourth? that's the part i can't derive.

**Tutor** (54 words, longest stretch 21, first text 1332 ms):
> Okay, let's build it. Light's electric field shakes a molecule's charges, giving it an induced dipole moment proportional to the field.
>
> That dipole oscillates at the light's frequency, and its acceleration goes as omega squared times p.
>
> A radiating dipole's far field is proportional to that acceleration, so it also goes as omega squared.

Board: `focus`, `clearBoard`, `writeMath p = \alpha E_0`, `writeMath a \propto \omega^2 p`, `writeMath E_{rad} \propto a \propto \omega^2`

**Student:** so the radiated field goes as omega squared, and that's one power of frequency... but i still don't see where the fourth power comes from. is it because intensity is squared?

**Tutor** (48 words, longest stretch 18, first text 1297 ms):
> Yes, exactly that. Intensity goes as the field squared, so omega squared gets squared.
>
> And since omega is two pi c over lambda, that's one over lambda to the fourth.
>
> One caveat: this treats alpha as constant, which works because visible light sits far below the molecules' resonances.

Board: `focus`, `writeMath I \propto E_{rad}^2 \propto \omega^4`, `writeMath \omega = \frac{2\pi c}{\lambda} \Rightarrow I \propto \frac{1}{\lambda^4}`

**Student:** so the field goes as omega squared, intensity squares that to omega to the fourth, and omega is proportional to one over lambda. got it. thanks, that clears it up.

**Tutor** (27 words, longest stretch 27, first text 1246 ms):
> That's the whole chain, yes. For the exam, they may ask how much more blue scatters than red. Try it with four hundred and seven hundred nanometres.

Board: `focus`

**Student:** um, is it like seven hundred over four hundred to the fourth? that would be about 0.24... no wait, that's the wrong way round. i think it's seven to the fourth over four to the fourth, so about 600.

**Tutor** (49 words, longest stretch 20, first text 1334 ms):
> You caught the flip yourself. The setup is right, but the number isn't.
>
> Seven to the fourth is two thousand four hundred and one. Four to the fourth is two hundred and fifty-six.
>
> So it's about nine point four, not six hundred.
>
> Where did the six hundred come from?

Board: `focus`, `writeMath \left(\frac{700}{400}\right)^4 = \left(\frac{7}{4}\right)^4`, `writeMath \frac{2401}{256} \approx 9.4`

**Student:** honestly i just guessed the number without working it out. i didn't check it properly, sorry.

**Tutor** (47 words, longest stretch 27, first text 1363 ms):
> No need to apologise. A quick sanity check would have caught it, though. Seven over four is under two, and two to the fourth is only sixteen.
>
> So the answer has to be below sixteen.
>
> Try violet at four hundred against green at five hundred and fifty.

Board: `focus`
