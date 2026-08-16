
## dialogue / say-statement
```
"This is narration."

"Eileen" "This is dialogue, with an explicit character name."

e "This is dialogue, using a character object instead."

"Bam!!" with vpunch
```
```
"I walked past a sign saying, \"Let's give it 100%%!\""
```

## dialogue / defining-character-objects
- **Character(name=..., kind=adv, **args)**: Creates and returns a Character object, which controls the look
and feel of dialogue and narration.

nameIf a string, the name of the character for dialogue. When
name is None, display of the name is omitted, as for
narration. If no name is given, the name is taken from
kind, and otherwise defaults to None.
- **name**: The Character to base this Character off of. When used, the
default value of any argument not supplied to this Character
is the value of that argument supplied to kind. This can
be used to define a template character, and then copy that
character with changes.
This can also be a namespace, in which case the 'character'
variable in the namespace is used as the kind.
- **kind**: 
- **image**: A string giving the image tag that is linked with this
character.
- **voice_tag**: A String that enables the voice file associated with the
Character to be muted or played in the 'voice' channel.
- **what_prefix**: A string that is prepended to the dialogue being spoken before
it is shown.
- **what_suffix**: A string that is appended to the dialogue being spoken before
it is shown.
- **who_prefix**: A string that is prepended to the name of the character before
it is shown.
- **who_suffix**: A string that is appended to the name of the character before
it is shown.
- **dynamic**: If true, then name should either be a string containing a Python
expression, a function, or a callable object. If it's a string,
That string will be evaluated before each line of dialogue, and
the result used as the name of the character. Otherwise, the
function or callable object will be called with no arguments
before each line of dialogue, and the return value of the call will
be used as the name of the character.
- **condition**: If given, this should be a string containing a Python
expression. If the expression is false, the dialogue
does not occur, as if the say statement did not happen.
- **interact**: If true, the default, an interaction occurs whenever the
dialogue is shown. If false, an interaction will not occur,
and additional elements can be added to the screen.
- **advance**: If true, the default, the player can click to advance through
the statement, and other means of advancing (such as skip and
auto-forward mode) will also work. If false, the player will be
unable to move past the say statement unless an alternate means
(such as a jump hyperlink or screen) is provided.
- **callback**: A function that is called when events occur while the
character is speaking. See the section on
Character Callbacks for more information.
- **ctc**: A displayable to use as the click-to-continue indicator, unless
a more specific indicator is used.
- **ctc_pause**: A displayable to use a the click-to-continue indicator when the
display of text is paused by the {p} or {w} text tags.
- **ctc_timedpause**: A displayable to use a the click-to-continue indicator when the
display of text is paused by the {p=} or {w=} text tags. When
None, this takes its default from ctc_pause, use Null()
when you want a ctc_pause but no ctc_timedpause.
- **ctc_position**: Controls the location of the click-to-continue indicator.
This can be:

"nestled"The indicator is displayed as part of the text
being shown, immediately after the last character.
- **"nestled"**: Similar to "nestled", but a break is not allowed between
the text and the CTC indicator.
- **"nestled-close"**: If a screen named "ctc" exists, it is shown. Otherwise, the CTC
displayable is show, and the position style properties of the CTC
displayable are used to position the CTC indicator.
- **"fixed"**: When given, the variable named "ctc" is set to the CTC displayable
when the CTC indicator should be show. This can be used with the
following screen language:
default ctc = None
showif ctc:
 add ctc
- **"screen-variable"**: 
- **screen**: The name of the screen that is used to display the dialogue.
- **retain**: If not true, an unused tag is generated for each line of dialogue,
and the screens are shown non-transiently. Call renpy.clear_retain()
to remove all retained screens. This is almost always used with
Speech Bubbles.
- **show_layer**: If given, this should be a string giving the name of the layer
to show the say screen on.
```
define e = Character("Eileen", who_color="#c8ffc8")
```
```
e "Hello, world."
```
```
default ctc = None
showif ctc:
add ctc
```

## dialogue / special-characters
- **adv**: The default kind of character used by Character. This sets up a
character such that one line is displayed on the screen at a
time.
- **nvl**: A kind of Character that causes dialogue to be displayed in
NVL-Mode Tutorial, with multiple lines of text on the screen
at once.
- **narrator**: The character that's used to display narration, by say statements
without a character name.
- **name_only**: A character that is used for dialogue in which the
character name is given as a string. This character is copied to a
new character with the given name, and then that new character is
used to display the dialogue.
- **centered**: A character that causes what it says to be displayed centered,
in the middle of the screen, outside of any window.
- **vcentered**: A character that causes what it says to be displayed centered
in vertically oriented text, in the middle of the screen,
outside of any window.
- **extend**: A character that causes the last character to speak to say a line
of dialogue consisting of the last line of dialogue spoken, "{fast}",
and the dialogue given to extend. This can be used to have the screen
change over the course of dialogue.
Extend is aware of NVL-mode and treats it correctly. Extend does not work
properly if the language preference changes between the initial say and
the extend.
```
# Show the first line of dialogue, wait for a click, change expression, and show
# the rest.

show eileen concerned
e "Sometimes, I feel sad."
show eileen happy
extend " But I usually quickly get over it!"

# Similar, but automatically changes the expression when the first line is finished
# showing. This only makes sense when the user doesn't have text speed set all the
# way up.

show eileen concerned
e "Sometimes, I feel sad.{nw}"
show eileen happy
extend " But I usually quickly get over it!"
```

## dialogue / dialogue-window-management
- **window show**: The window show statement causes the window to be shown.
It takes as an argument an optional transition, which is used to show the
window. If the transition is omitted, config.window_show_transition
is used.
- **window hide**: The window hide statement causes the window to be hidden. It takes as an
argument an optional transition, which is used to hide the window. If
the transition is omitted, config.window_hide_transition is
used.
- **window auto True**: This enables automatic management of the window. The window is shown
before statements listed in config.window_auto_show – by default,
say statements. The window is hidden before statements listed in
config.window_auto_hide – by default, scene and call screen
statements, and menu statements without a caption.
Only statements are considered, not statement equivalent functions.
- **window auto False**: This disables automatic management of the window. The window is not
shown or hidden automatically.
```
window show # shows the window with the default transition, if any.
pause # the window is shown during this pause.
window hide # hides the window.
pause # the window is hidden during this pause.

window show dissolve # shows the window with dissolve.
pause # the window is shown during this pause.
window hide dissolve # hides the window with dissolve.
pause # the window is hidden during this pause.


window auto True

"The window is automatically shown before this line of dialogue."
pause # the window is shown during this pause.

scene bg washington # the window is hidden before the scene change.
with dissolve

window show # Shows the window before it normally would be shown.

show eileen
with dissolve

"Without window show, the window would have been shown here."
```

## dialogue / say-with-arguments
```
e "Hello, world." (what_color="#8c8")
```
```
init python:
def say_arguments_callback(char, *args, **kwargs):
if colorblind_mode:
kwargs["what_color"] = "#000"
return args, kwargs

define config.say_arguments_callback = say_arguments_callback
```

## dialogue / monologue-mode
```
"""
This is the first line of narration. It's longer than the other two
lines, so it has to wrap.

This is the second line of narration.

This is the third line of narration.
"""

e """
This is the first line of dialogue. It's longer than the other two
lines, so it has to wrap.

This is the second line of dialogue.

This is the third line of dialogue.
"""
```

## dialogue / the-character-store
```
define character.e = Character("Eileen")
```
```
default e = 0

label start:

# This is still a terrible variable name.
$ e = 100

e "Our current energy is [e] units."
```
```
define character.naomi = Character("Naomi Nagata", who_color="#8c8")
default naomi = PersonClass(engineering=5, max_g_force=.7) # can be an object...
define character.fred = Character("Fred Johnson", who_color="#72f")
default fred.money = 1000 # ...or a dedicated named store
default fred.rank = "Colonel"

label traded:
fred "Here you go."
$ fred.money -= 50
$ naomi.money += 50
naomi "Thanks ! I knew you would value my class-[naomi.engineering] engineering skills."
```