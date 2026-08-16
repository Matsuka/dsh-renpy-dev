
## special / say
- **who**: The text of the name of the speaking character.
- **what**: The dialogue being said by the speaking character.
- **"who"**: A text displayable, displaying the name of the speaking
character. The character object can be given arguments that style
this displayable.
- **"what"**: A text displayable, displaying the dialogue being said by the
speaking character. The character object can be given arguments that style
this displayable. A displayable with this id must be defined,
as Ren'Py uses it to calculate auto-forward-mode time,
click-to-continue, and other things.
- **"window"**: A window or frame. This conventionally contains the who and what
text. The character object can be given arguments that style
this displayable.
```
screen say(who, what):

window id "window":
has vbox

if who:
text who id "who"

text what id "what"
```

## special / choice
- **items**: This is a list of menu entry objects, representing each of the
choices in the menu. Each of the objects has the following
fields on it:


caption
A string giving the caption of the menu choice.
- **caption**: 
- **action**: An action that should be invoked when the menu choice is
chosen. This may be None if this is a menu caption, and
config.narrator_menu is False.
- **chosen**: This is True if this choice has been chosen at least once
in any playthrough of the game.
- **args**: This is a tuple that contains any positional arguments passed
to the menu choice.
- **kwargs**: This is a dictionary that contains any keyword arguments passed
to the menu choice.
```
screen choice(items):

window:
style "menu_window"

vbox:
style "menu"

for i in items:

if i.action:

button:
action i.action
style "menu_choice_button"

text i.caption style "menu_choice"

else:
text i.caption style "menu_caption"
```

## special / input
- **prompt**: The prompt text supplied to renpy.input.
- **"input"**: An input displayable, which must exist. This is given all the
parameters supplied to renpy.input, so it must exist.
```
screen input(prompt):

window:
has vbox

text prompt
input id "input"
```