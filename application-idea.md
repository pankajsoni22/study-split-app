# About
This application is mainly used to write articles but in an interesting way. Application allows write article and make diagrams on the side.
Imagine I want to write my project, which will have text presentation, block diagrams similar to excalidraw, May be some code areas in different languages like python, java, c etc. The goad is to provide a platform that can change article reading and writing experience completely. People can come here and save their projects, Revise them. Save FAQs in the interviews. A complete solution for their notes.

# Features
1. Application will have multiple modes for example (Modes are not limited to following, you can add your creativity, keeping user best experience in the center.)
- Split Mode: Left side text and right side drawing. But how do we use this screen, following are few ways but not only limited to you can be creative to define that on UI
    - Split Mode 1 (can be named better): Something similar to ppt presentation mode, we click on next and we see next item. 
    - Split Mode 2: (can be named better): We can scroll the whole screen, both left and right part scroll together (similar to normal scroll.)
- Merge Mode: Vertical arrangement of text and drawings (exactly what happens in normal articles)
- Any other better experience is accepted.
2. The web application should be compatible on large screen, medium screen and small screen like mobiles.
3. An article can be in draft state and published state based on their writer or admin actions.
4. Admin can see all the articles in any state.
5. Editor and drawing tool must be open source with best features available.
6. One should be able to download the whole article as pdf.
7. A user / writer should be able to attach tags like "interview experience", "system design", etc with the articles.
8. A user can define "Detailed", "Brief" version of article i.e. If a person want to read in detail they can toggle to detailed, else they can toggle to brief for example if someone want to revise, they can always read in brief like short notes. But if user do not want to do so, we don't show Brief option.
9. If a user want to write different articles like, System Design, Interview Experience, Software Engineering project the web application provides templates to start with, though a user can customize the template once it is loaded.
10. Every user will have a username, when they sign up , the username is assigned to them and asked to either accept or change the username. Anything what a user is publishing will always go under her username like github repositories.
11. Middle separator of the screen can be adjusted left and right based on user's choice but, default will be at the center.
12. Web application should save user preferred configuration in local browser so that when a user lands back to a page they see the page in exact same position where they left it off.
13. To ease backend load, let's give an indicator, that current written article has been modified and give a save to remote button (ctrl + s) should also work, disable the button if it is saved also show progressbar once the work is in progress.
14. Article can hold internet links may be in blue colors, when a user clicks on this link it should not open that link but we show a popup screen and we show that website into a pop-up screen, a person can read content in that popup screen only, a beautifully desined pop-up screen, but with that we can give an icon to close that screen, or leave the website and open a new tab with that link. If this link is article from our website only and has split screen, the pop up screen has only very small space, right? so we only show article text but we give switch to drawings may be an arrow kind of button that can enable the user to have a look at drawing itself.


# Roles related
Let us define 3 Roles
1. ADMIN: Has every permission.
2. USER-RW: These users can read and write articles and also publish them.
3. USER-RO: These users can only read articles. 

# Tech stack
1. I want something like excalidraw with maximum features available.
2. As for this application I am going to save text content, as well as drawing content to make them application persistent. Recommend which data store is best to store?
3. Can I use google's free available stack (initially I'll only be the user), later I can migrate to cloud like AWS or GCP.
4. Any other tech stack you want to highlight please go and do.

# Application theme
- I am thinking to design the application theme similar to hellointerview but I don't want to copy their theme I need something that becomes identity of my application and easy on my user's eye, looks attractive. Work extra-ordinarily to decide on theme.

# Important
- This application is the trial version so make it with best user experience.
- Application should be optimized and well structured.
- This is just a proto type and want to leverage free infrastructure provided by Google or someone else to host this application, mostly we can host on github.io
- Write the application in such a way it is easy to migrate to cloud services like AWS or Google Cloud platform with minimum code and configuration changes.
- Application should load with minimum delay.
- Number of database calls should be optimized.