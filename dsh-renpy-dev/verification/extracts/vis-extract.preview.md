
## transitions / dict-transitions
```
define dis = { "master" : Dissolve(1.0) }

label start:
show eileen happy
with dis

e "Hello, world."
```
```
define config.window_show_transition = { "screens" : Dissolve(.25) }
define config.window_hide_transition = { "screens" : Dissolve(.25) }
```

## transitions / atl-transitions
```
transform spin(duration=1.0, *, new_widget=None, old_widget=None):

# Set how long this transform will take to complete.
delay duration

# Center it.
xcenter .5
ycenter .5

# Spin the old displayable.
old_widget
events False
rotate 0.
easeout (duration / 2) rotate 360.0

# Spin the new displayable.
new_widget
events True
easein (duration / 2) rotate 720.0
```

## transitions / python-transitions
```
init python:
def dissolve_or_pixellate(old_widget=None, new_widget=None):
if persistent.want_pixellate:
return pixellate(old_widget=old_widget, new_widget=new_widget)
else:
return dissolve(old_widget=old_widget, new_widget=new_widget)
```

## transitions / automatic-transitions-after-scene-show-and-hide
```
define _scene_show_hide_transition = Dissolve(0.25)

label start:
scene bg washington
show eileen happy

"The transition won't show here, because the dialogue window transitioned in."

show lucy mad at right

"The transition will happen here."

hide lucy mad
show eileen vhappy

"And it will happen here, as well."
```