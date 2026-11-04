// A topic passes only if every word is on these lists, so a place, a name, a school, a faith, a health condition, a substance, or a sexuality cannot be kept: it is simply not here. Words match exactly, with no stemming, because "rape" must not pass on the strength of "rap". Leave out on purpose any word that could describe a child, such as thin, fat, gay, or sick, and do not add `my`, `i`, or `being`.

/** Every word of the library's titles, subjects, and interests, including the deeper scenes, less the few in `LEFT_OUT_OF_THE_LIBRARY`. */
const LIBRARY_WORDS = `about across actually after alchemists algorithm along always an and angle apart appear approximate arc are aristotle around art asking astronomy at
  atomic atoms backspin backward balance ball barely basketball becomes bending bends between bigger biology black block blue box braking bread breaking
  breaks browned builds by cake can car carbon cards cars carve causes change checking checks chemical chemistry chord circuit clock clocks close coding
  collisions colors come comes completing computer computers cooking copied copies correct count crosses curls current curves dark day days degrees
  depends depth derivative diagonal digits dijkstra disagreed discriminant distance dna does drop drops durer each earth east electron element elements
  empty energy engine equations equator escape escapes event every exhaust expected explores face factoring fails falling far fashion fast faster
  fastest fed fibonacci file find finds five flies flight flip follows food football for form formula forty forward four frames free from fuel fuses
  fusion gaming gaps gases get gets gives go goal goals gogh gold golden good gps graph grid ground group grow growing grows half halfway happens has
  heads heat helicase helium high higher history holds hole horizon hottest how hydrogen impossible in indigo inner inside into iron is its itself jeans
  jump keeps kick last lasts launch least light like line little locking longer look loom made magic make makes map mass math mean means measures minor
  mixture months moon moons more most motion move movies moving much muons music must near needs neutron never new no noble not notes number numbers
  objects odds of off old on once one orbit orders out outside packs paint painters pairs parabola particles pattern peak per periodic petrol philosophy
  physics pieces places plato play poles polymerase position positive power prices proof properties pull punched put pyramids pythagoras quadratic
  rainbow raindrop ran ratio reach react really rearranging recursion red repeat reversed revolution right rim ring rings rise road rocket rockets roots
  round route row rows ruins run same satellites saturn savings says scatters science search seasons secant second see seed seeds set shape share shares
  shells short shortest shot shows shrink side sideways sits size slope slow slowed slowing slowly slows small so socrates softens solstice some sorts
  sound sounds space speed spin spins spirals splits spreads square squared squares squeezing stages star stars stays still stops strand strands stretch
  stretches strings strokes summer sunflower sunlight supernova table tangent target tastes test than that the their then things three throw tidal tides
  tilt time tip to too toward trial triangle turned two unzips van velocity vertex was wave were what where which white why with without work works
  world wrong zero`;

/** Words that join a topic together. */
const JOINING_WORDS = `a an the of to in on at for with and or how why what when where which that this these those from by as is are was were into onto between across over under through using about after before have has its their each both more less than not without within per same different first second third one two three four five six seven eight nine ten half halves quarter quarters thirds some all any do does can will it`;

/** The parts and moves of working a problem, which name what a line shows without naming a subject the session never touched. */
export const WORKING_WORDS = `add adding added addition subtract subtracting subtracted subtraction multiply multiplying multiplied multiplication divide dividing divided division solve solving solved find finding work working worked simplify simplifying simplified expand expanding expanded factor factors factoring isolate isolating isolated substitute substituting substituted cancel cancelling balance balancing moving move moved remove removing removed undo undoing rearrange rearranging combine combining collect collecting compare comparing convert converting round rounding estimate estimating measure measuring calculate calculating count counting graph graphing plot plotting draw drawing read reading write writing check checking complete completing apply applying name naming label labelling understand understanding explain explaining remember remembering learn learning study studying show showing use meaning instead
  term terms variable variables denominator denominators numerator numerators coefficient coefficients sign signs minus plus negative positive power powers exponent exponents equals side sides root roots unlike order brackets parentheses step steps line lines answer answers problem problems question questions mistake mistakes error errors word words repeated repeat repeating again wrong right exam exams test tests homework revision method methods rule rules example examples value values unknown unknowns constant constants part parts money equation equations`;

/** School subjects and the concepts taught in them, as the tutor teaches them. A name here is a name in a textbook. */
const CURRICULUM_NOUNS = `subject topic concept idea theory law principle model fact
  fraction decimal percentage percent ratio proportion integer number digit sum product quotient remainder multiple prime square cube sequence series pattern set function equation inequality expression formula identity polynomial binomial quadratic logarithm matrix vector scalar graph axis coordinate gradient slope intercept angle triangle rectangle circle polygon parallelogram trapezium trapezoid rhombus hexagon pentagon sphere cylinder cone pyramid prism radius diameter circumference perimeter area volume hypotenuse tangent sine cosine derivative integral limit mean median mode range average probability chart histogram table proof theorem shape symmetry transformation translation rotation reflection enlargement unit base
  force acceleration momentum velocity speed distance displacement energy work power pressure density friction gravity tension inertia mass current voltage resistance circuit resistor capacitor magnet magnetism field charge wave frequency wavelength amplitude refraction lens mirror spectrum photon electron proton neutron nucleus atom radiation orbit planet star galaxy comet asteroid telescope universe temperature heat conductor insulator lever pulley machine vibration echo pendulum projectile collision spring
  element compound mixture molecule ion isotope bond reaction acid salt metal nonmetal solution solvent solute solid liquid gas crystal catalyst oxide polymer electrolysis equilibrium indicator mole valency periodic halogen
  cell nucleus mitochondrion membrane organ tissue enzyme protein carbohydrate vitamin mineral gene chromosome allele trait species habitat ecosystem predator prey producer consumer decomposer food plant animal leaf stem flower seed fruit fungus microbe bacterium virus insect reptile mammal amphibian fish bird heart lung kidney liver stomach brain bone muscle nerve neuron skeleton artery vein tooth
  continent ocean river mountain volcano hole chain shadow lesson earthquake glacier climate biome rainforest desert map latitude longitude population erosion sediment rock fossil layer plate cloud season tide cycle
  market price supply demand budget profit loss tax trade cost revenue business economy
  noun verb adjective adverb pronoun tense sentence paragraph essay poem novel story metaphor simile character plot theme grammar vocabulary spelling language
  empire war revolution civilization kingdom treaty constitution government democracy election parliament timeline
  algorithm loop array variable database program website computer network pixel bit byte recursion string class object method`;

/** School subjects and the concepts taught in them that are not plain nouns, so each form is listed. */
const CURRICULUM_WORDS = `math maths mathematics algebra geometry trigonometry calculus statistics arithmetic physics chemistry biology astronomy geography history economics literature english french spanish german latin greek roman egyptian american industrial civil cold world
  linear simultaneous exponential algebraic geometric arithmetic numerical whole mixed equivalent improper common lowest highest factorial reciprocal perpendicular parallel adjacent opposite acute obtuse isosceles equilateral scalene circular rectangular triangular
  free body diagram diagrams kinetic potential gravitational electric electrical electricity magnetic electromagnetic nuclear thermal mechanical newton newtons ohm ohms einstein kepler galileo faraday archimedes euclid pythagorean hooke boyle pascal curie bohr mendel darwin relativity quantum thermodynamics optics mechanics buoyancy evaporation condensation precipitation convection conduction reflection diffraction
  organic inorganic ionic covalent acidic alkaline alkali oxidation reduction combustion titration atomic molecular chemical
  photosynthesis respiration digestion circulation mitosis meiosis osmosis diffusion transpiration evolution natural selection genetics dna rna chlorophyll ecology anatomy immune system nervous digestive circulatory respiratory blood bacteria microbes fungi pollination germination nitrogen oxygen carbon hydrogen helium dioxide water air sun earth moon sky night weather rain snow ice steam
  tectonic tectonics renewable global warming solar lunar rainfall ancient medieval modern human long color colors colour colours bodmas pemdas times
  programming coding software hardware binary conditional python javascript computer science
  supply demand inflation interest compound simple
  past present future perfect plural singular reading writing spelling punctuation comprehension poetry drama prose`;

/** What students say they like, used only for `cares_about`. */
const INTEREST_NOUNS = `kite film movie book novel comic cartoon game video song instrument guitar drum piano violin keyboard flute trumpet robot drone rocket planet star dinosaur animal dog cat horse bird insect plane airplane train ship car motorcycle bike truck puzzle
  engineer doctor nurse pilot astronaut scientist lawyer teacher artist musician chef architect programmer developer designer inventor journalist writer athlete footballer vet farmer singer dancer actor photographer`;
const INTEREST_WORDS = `watching banking football soccer basketball tennis volleyball cricket rugby swimming running athletics cycling chess dancing dance singing music art drawing painting photography writing poetry reading stories anime manga gaming minecraft coding programming robotics space nature gardening farming cooking baking food fashion design sewing building lego magic rap jazz afrobeats engineering science inventing animation filmmaking acting drama theatre skateboarding gymnastics boxing karate hiking camping fishing`;

const toList = (text: string) => text.split(/\s+/).filter(Boolean);
const withPlurals = (text: string) => toList(text).flatMap((noun) => [noun, /(?:s|x|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`]);
const IRREGULAR_PLURALS = `volcanoes mitochondria nuclei bacteria fungi leaves teeth axes matrices vertices theories bodies batteries galaxies energies countries species`;

const CONCEPTS = new Set([...toList(LIBRARY_WORDS), ...toList(JOINING_WORDS), ...toList(WORKING_WORDS), ...withPlurals(CURRICULUM_NOUNS), ...toList(CURRICULUM_WORDS), ...toList(IRREGULAR_PLURALS)]);
const CONCEPTS_AND_INTERESTS = new Set([...CONCEPTS, ...withPlurals(INTEREST_NOUNS), ...toList(INTEREST_WORDS)]);

/** Words a detail may use on top of a topic's, to say what went wrong. */
const WORDS_FOR_A_DETAIL = new Set([...CONCEPTS, ...toList(`but so then instead kept keep keeps forgot forget dropped drop missed miss mixed mix changed change wrote written took take got get gets went go did had has have after before still also just only very because would could up down out`)]);

const MATH_TOKEN = /^(?:\p{L}|\d{1,3}\p{L}?)$/u;

/** Full-width letters, hidden characters, and accents are read as the plain word they look like, and anything else stays off the list. */
export const toListWords = (text: string) => text.normalize('NFKD').replace(/\p{Cf}|\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function areAllAllowed(text: string, allowed: ReadonlySet<string>): boolean {
  const words = toListWords(text);
  return words.length > 0 && words.every((word) => allowed.has(word) || MATH_TOKEN.test(word));
}

/** Only `cares_about` may use the interests, and every other kind of note, known or not, gets the narrower list. */
export const isTopicOnTheList = (kind: string, topic: string) => areAllAllowed(topic, kind === 'cares_about' ? CONCEPTS_AND_INTERESTS : CONCEPTS);
export const isDetailOnTheList = (detail: string) => areAllAllowed(detail, WORDS_FOR_A_DETAIL);
