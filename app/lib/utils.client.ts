export const americanToBritish = (chunk: string): string => {
    // Words that end in -or → -our
    const orToOurWords = [
        'color',
        'favor',
        'flavor',
        'honor',
        'humor',
        'labor',
        'neighbor',
        'rumor',
        'splendor',
        'vapor',
        'vigor',
        'ardor',
        'candor',
        'clamor',
        'demeanor',
        'endeavor',
        'fervor',
        'harbor',
        'odor',
        'parlor',
        'rancor',
        'rigor',
        'savior',
        'savory',
        'valor',
        'behavior',
        'glamor',
        'tumor',
    ];

    // Words that should NEVER be converted from -ize to -ise (exceptions to the rule)
    // These are words where -ize is correct in both American and British English
    const izeExceptions = [
        'size',      // size, sized, sizing (not "sise")
        'prize',     // prize, prized (not "prise" which means to pry open)
        'seize',     // seize, seized (not "seise")
        'capsize',   // capsize, capsized
    ];

    // Words ending in -yze that convert to -yse
    const yzeToYseWords = [
        'analyze',
        'paralyze',
        'catalyze',
        'hydrolyze',
        'electrolyze',
        'dialyze',
        'breathalyze',
    ];

    // Words that end in -er → -re
    const erToReWords = [
        'center',
        'fiber',
        'liter',
        'meter',
        'theater',
        'saber',
        'somber',
        'caliber',
        'meager',
        'scepter',
        'specter',
        'maneuver',
        'louver',
    ];

    // Words that end in -ense → -ence
    const enseToEnceWords = ['defense', 'offense', 'license', 'pretense'];

    // Words that double the final L in British
    const doubleL = [
        { us: 'traveling', uk: 'travelling' },
        { us: 'traveled', uk: 'travelled' },
        { us: 'traveler', uk: 'traveller' },
        { us: 'canceled', uk: 'cancelled' },
        { us: 'canceling', uk: 'cancelling' },
        { us: 'labeled', uk: 'labelled' },
        { us: 'labeling', uk: 'labelling' },
        { us: 'modeling', uk: 'modelling' },
        { us: 'modeled', uk: 'modelled' },
        { us: 'counselor', uk: 'counsellor' },
        { us: 'counseling', uk: 'counselling' },
        { us: 'leveled', uk: 'levelled' },
        { us: 'leveling', uk: 'levelling' },
        { us: 'fueled', uk: 'fuelled' },
        { us: 'fueling', uk: 'fuelling' },
    ];

    // Context-aware exceptions - words that should only convert in specific contexts
    const contextAwareConversions = [
        {
            // "check" → "cheque" only for payment instruments (e.g., "cash a check", "write a check")
            pattern: /\b(cash|write|deposit|bounce|clear|issue|receive|pay by|bank|personal|certified)\s+(a\s+)?check\b/gi,
            replacement: (match: string) => match.replace(/check/gi, (m) => preserveCase(m, 'cheque'))
        },
        {
            // "program" → "programme" only for TV/radio/theater (not for software/computing)
            // Look for contexts like "TV program", "radio program", "watch a program"
            pattern: /\b(tv|radio|television|broadcast|watch|view|aired?|scheduled?)\s+(a\s+)?(program)s?\b/gi,
            replacement: (match: string) => match.replace(/program/gi, (m) => preserveCase(m, 'programme'))
        },
        {
            // "tire" → "tyre" only for wheels (e.g., "car tire", "flat tire", "spare tire")
            pattern: /\b(car|vehicle|wheel|flat|spare|change|replace|punctured?|burst)\s+(a\s+)?(tire)s?\b/gi,
            replacement: (match: string) => match.replace(/tire/gi, (m) => preserveCase(m, 'tyre'))
        },
        {
            // "story" → "storey" only for building levels (e.g., "two-story building", "third story")
            pattern: /\b(\d+-?|two-?|three-?|multi-?|single-?)(story)\s+(building|house|structure|apartment|tower)\b/gi,
            replacement: (match: string) => match.replace(/story/gi, (m) => preserveCase(m, 'storey'))
        }
    ];

    // Simple exceptions - always convert these
    const exceptions: Record<string, string> = {
        gray: 'grey',
        aluminum: 'aluminium',
        mom: 'mum',
        math: 'maths',
        airplane: 'aeroplane',
        esthetic: 'aesthetic',
        anesthesia: 'anaesthesia',
        catalog: 'catalogue',
        dialog: 'dialogue',
        jewelry: 'jewellery',
        pajamas: 'pyjamas',
        plow: 'plough',
        skeptical: 'sceptical',
        skillful: 'skilful',
    };

    const preserveCase = (original: string, replacement: string): string => {
        if (original === original.toUpperCase()) {
            return replacement.toUpperCase();
        }
        if (original[0] === original[0].toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    };

    let result = chunk;

    // Apply -or → -our transformations
    orToOurWords.forEach((word) => {
        const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(pattern, (match) =>
            preserveCase(match, word.replace(/or$/, 'our'))
        );
    });

    // Apply -ize → -ise transformations using smart pattern matching
    // Convert most words ending in -ize to -ise, but skip exceptions
    // This catches: organize→organise, customize→customise, realize→realise, etc.
    // And their derivatives: -ization→-isation, -izing→-ising, -ized→-ised, -izer→-iser
    const izeExceptionPattern = izeExceptions.join('|');

    result = result.replace(
        /\b([a-z]+)(iz)(e|ed|es|ing|ation|ations|er|ers)\b/gi,
        (match, stem, iz, suffix) => {
            // Check if this is an exception word
            const fullWord = stem + iz + (suffix.startsWith('e') ? 'e' : suffix.startsWith('a') ? 'ation' : '');
            if (new RegExp(`\\b(${izeExceptionPattern})`, 'i').test(fullWord)) {
                return match; // Don't convert exceptions
            }

            // Convert -ize to -ise
            const convertedSuffix = suffix
                .replace(/^ation/, 'isation')
                .replace(/^e$/, 'e')
                .replace(/^ed$/, 'ed')
                .replace(/^es$/, 'es')
                .replace(/^ing$/, 'ing')
                .replace(/^er/, 'er');

            return preserveCase(match, stem + 'is' + convertedSuffix);
        }
    );

    // Apply -yze → -yse transformations
    yzeToYseWords.forEach((word) => {
        const stem = word.replace(/yze$/, '');
        const patterns = [
            { from: new RegExp(`\\b(${word})\\b`, 'gi'), to: `${stem}yse` },
            {
                from: new RegExp(`\\b(${stem}yzing)\\b`, 'gi'),
                to: `${stem}ysing`,
            },
            {
                from: new RegExp(`\\b(${stem}yzed)\\b`, 'gi'),
                to: `${stem}ysed`,
            },
            {
                from: new RegExp(`\\b(${stem}yzer)\\b`, 'gi'),
                to: `${stem}yser`,
            },
        ];
        patterns.forEach(({ from, to }) => {
            result = result.replace(from, (match) => preserveCase(match, to));
        });
    });

    // Apply -er → -re transformations
    erToReWords.forEach((word) => {
        const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(pattern, (match) =>
            preserveCase(match, word.replace(/er$/, 're'))
        );
    });

    // Apply -ense → -ence transformations
    enseToEnceWords.forEach((word) => {
        const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(pattern, (match) =>
            preserveCase(match, word.replace(/ense$/, 'ence'))
        );
    });

    // Apply double L transformations
    doubleL.forEach(({ us, uk }) => {
        const pattern = new RegExp(`\\b(${us})\\b`, 'gi');
        result = result.replace(pattern, (match) => preserveCase(match, uk));
    });

    // Apply context-aware conversions (must happen before simple exceptions)
    contextAwareConversions.forEach(({ pattern, replacement }) => {
        result = result.replace(pattern, replacement);
    });

    // Apply simple exceptions
    Object.entries(exceptions).forEach(([us, uk]) => {
        const pattern = new RegExp(`\\b(${us})\\b`, 'gi');
        result = result.replace(pattern, (match) => preserveCase(match, uk));
    });

    return result;
};
