
## translation / translation-units
```
label start:
e "Thank you for taking a look at the Ren'Py translation framework."

show eileen happy

e "We aim to provide a comprehensive framework for translating dialogue, strings, images, and styles."

e "Pretty much everything your game needs!"
```
```
e "Thank you for taking a look at the Ren'Py translation framework."
```
```
e "We aim to provide a comprehensive framework for translating dialogue, strings, images, and styles."
```
```
e "Pretty much everything your game needs!"
```

## translation / translate-statement
```
# game/script.rpy:95
translate piglatin start_636ae3f5:

# e "Thank you for taking a look at the Ren'Py translation framework."
e ""

# game/script.rpy:99
translate piglatin start_bd1ad9e1:

# e "We aim to provide a comprehensive framework for translating dialogue, strings, images, and styles."
e ""

# game/script.rpy:101
translate piglatin start_9e949aac:

# e "Pretty much everything your game needs!"
e ""
```
```
# game/script.rpy:95
translate piglatin start_636ae3f5:
# e "Thank you for taking a look at the Ren'Py translation framework."
e "Ankthay ouyay orfay akingtay away ooklay atway ethay En'Pyray anslationtray ameworkfray."

# game/script.rpy:99
translate piglatin start_bd1ad9e1:

# e "We aim to provide a comprehensive framework for translating dialogue, strings, images, and styles."
e "Eway aimway otay ovidepray away omprehensivecay ameworkfray orfay anslatingtray ialogueday, ingsstray, imagesway, andway ylesstay."

# game/script.rpy:101
translate piglatin start_9e949aac:

# e "Pretty much everything your game needs!"
e "Ettypray uchmay everythingway ouryay amegay eedsnay!"
```

## translation / more-complex-translations
```
# game/script.rpy:99
translate piglatin start_bd1ad9e1:
# e "We aim to provide a comprehensive framework for translating dialogue, strings, images, and styles."
e "Eway aimway otay ovidepray away omprehensivecay ameworkfray..."
e "...orfay anslatingtray ialogueday, ingsstray, imagesway, andway ylesstay."
```
```
# game/script.rpy:101
translate piglatin start_9e949aac:

# e "Pretty much everything your game needs!"
pass
```
```
e "You scored [points] points!"
```
```
# game/script.rpy:103
translate piglatin start_36562aba:

# e "You scored [points] points!"
$ latin_points = to_roman_numerals(points)
e "Ouyay oredscay [latin_points] ointspay!"
```

## translation / tips
```
label start:
e "This used to have a typo." id start_61b861a2
```
```
label ignored_by_translation hide:
"..."
```

## translation / extracting-and-merging-string-translations
- **Replace existing translations**: When checked, this will cause non-trivial existing translations (those
that are not empty or the source string) to be replaced. By default,
merging will refuse to overwrite non-trivial translations that already
exist.
- **Reverse languages**: Reverses the strings before merging. This can be used, for example,
to use a set of English -> Russian translations to create a
Russian -> English translation.
- Select the source project, and choose "Generate Translations".
- Enter the language to extract, and click "Extract String Translations".
- Return to the main menu, select the target project, and choose "Generate Translations".
- Enter the language to merge to (often the same language), and choose "Merge String Translations".