
## gui / dialogue
- **gui/textbox.png**: This file contains the background of the text window, displayed as part
of the say screen. While this should be the full width of the game, text
is only displayed in the central 60% of the screen, with a 20% border
on either side.
- **define gui.text_color = "#402000"**: This sets the color of the dialogue text.
- **define gui.text_font = "ArchitectsDaughter.ttf"**: This sets the font that is used for dialogue text, menus, inputs, and
other in-game text. The font file should exist in the game directory.
- **define gui.text_size = 33**: Sets the size of the dialogue text. This may need to be increased or
decreased to fit the selected font in the space allotted.
- **define gui.name_text_size = 45**: Sets the size of character names.
```
define e = Character("Eileen", who_color="#104010")
```

## gui / choice-menus
- **gui/button/choice_idle_background.png**: This image is used as the background of choice buttons that are not
focused.
- **gui/button/choice_hover_background.png**: This image is used as the background of choice buttons that are focused.
- **define gui.choice_button_text_idle_color = '#888888'**: The color used for the text of unfocused choice buttons.
- **define gui.choice_button_text_hover_color = '#0066cc'**: The color used for the text of focused choice buttons.

## gui / colors-fonts-and-font-sizes
- **define gui.accent_color = '#000060'**: The accent color is used in many places in the GUI, including titles
and labels.
- **define gui.idle_color = '#606060'**: The color used for most buttons when not focused or selected.
- **define gui.idle_small_color = '#404040'**: The color used for small text (like the date and name of a save slot,
and quick menu buttons) when not hovered. This color often needs to be a
bit lighter or darker than idle_color to compensate for the smaller size
of the font.
- **define gui.hover_color = '#3284d6'**: The color used by focused items in the GUI, including the text of
of buttons and the thumbs (movable areas) of sliders and scrollbars.
- **define gui.selected_color = '#555555'**: The color used by the text of selected buttons. (This takes priority
over the hover and idle colors.)
- **define gui.insensitive_color = '#8888887f'**: The color used by the text of buttons that are insensitive to user input.
(For example, the rollback button when no rollback is possible.)
- **define gui.interface_text_color = '#404040'**: The color used by static text in the game interface, such as text on the
help and about screens.
- **define gui.muted_color = '#6080d0'**: 
- **define gui.hover_muted_color = '#8080f0'**: Muted colors, used for the sections of bars, scrollbars, and sliders that
do not represent the value or visible area. (These are only used when
generating images, and will not take effect until images are regenerated
in the launcher.)
- **define gui.interface_text_font = "ArchitectsDaughter.ttf"**: The font used for text for user interface elements, like the main and
game menus, buttons, and so on.
- **define gui.system_font = "DejaVuSans.ttf"**: The font used for system text, like exception messages and the shift+A
accessibility menu. This should be able to handle both ASCII and the
game's translated language.
- **define gui.glyph_font = "DejaVuSans.ttf"**: A font used for certain glyphs, such as the arrow glyphs used by the skip
indicator. DejaVuSans is a reasonable default for these glyphs, and is
automatically included with every Ren'Py game.
- **define gui.interface_text_size = 36**: The size of static text in the game's user interface, and the default size
of button text in the game's interface.
- **define gui.label_text_size = 45**: The size of section labels in the game's user interface.
- **define gui.notify_text_size = 24**: The size of notification text.
- **define gui.title_text_size = 75**: The size of the game's title.