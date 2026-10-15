/**
 * English text. Keys must match `ko.ts` (checked by a test).
 *
 * Not translated on purpose: product names ("롬앤 쥬시 래스팅 틴트") and colour family
 * names ("뮤트 로즈브라운"). Translating them would make the products impossible to find
 * in a Korean shop — they stay in Korean on the English screens too (see i18n/index.ts).
 *
 * The coach speaks casually in Korean (a character talking to you), so the English keeps
 * the same light, direct tone — "Let's check before we shoot!" rather than "Please confirm".
 */

export const EN = {
  /* ── language picker ── */
  "lang.label": "Language",
  "lang.ko": "한국어",
  "lang.en": "English",

  /* ── splash ── */
  "splash.tagline": "A makeup guide made for your face",
  "splash.aria": "nudy · a makeup guide you can try with templates — tap to continue",

  /* ── intro ── */
  "intro.coach": "Let's check these before we shoot!",
  "intro.start": "Start camera",
  "intro.check.bangs": "Fringe",
  "intro.check.glasses": "Glasses",
  "intro.check.light": "Lighting",
  "intro.photoAlt": "Example makeup photo with the brow, eyeliner and blush areas marked",

  /* ── photo handling notice (consent) ── */
  "consent.title": "How your photos are used",
  "consent.agree": "Agree and start",
  "consent.close": "Close",
  "consent.denied": "You need to agree to server processing to use this",
  "consent.back": "Let me think about it",
  "consent.s1.head": "Photos sent to the server",
  "consent.s1.body":
    "We take one photo of your bare face. That photo and the reference photo you upload are **sent to the server** to create your makeup preview. The photo you take after doing your makeup is **also sent to the server** for feedback.",
  "consent.s2.head": "Kept during the test period",
  "consent.s2.body":
    "This is a test period (until 3pm on 19 October). Your bare-face photo, makeup preview, after-makeup photo and feedback results are **kept on the server until 5pm on 19 October.** They are used only to check that the feedback is right and to tune the criteria. **Everything is deleted at 5pm on 19 October**, and we will delete it sooner if you ask — **just say so in the short survey at the end.** The **reference photo you upload is not kept**: it is deleted as soon as the preview is made.",
  "consent.s3.head": "What stays on your phone",
  "consent.s3.body":
    "Photos and results on your phone are **deleted the moment you tap Finish.** Even if you don't, they disappear when you close the tab — this version does not save photos to your phone.",
  "consent.s4.head": "Usage records",
  "consent.s4.body":
    "We also send usage records, which we use to improve the service. Only things like which link you arrived from, how far through the screens you got and which buttons you tapped — **your photos and face positions are never sent.** Usage records are also **deleted at 5pm on 19 October.**",

  /* ── 촬영 화면 ── */
  "capture.loading": "Getting the camera ready…",
  "capture.retry": "Try again",
  "capture.title": "Take a photo",
  "capture.doneTitle": "Check the photo",
  "capture.doneSub": "Have a look at the photo we took",
  "capture.doneCoach": "Shall we do your makeup like this?",
  "capture.retake": "Retake",
  "capture.go": "Pick a look",
  "capture.aim": "Line your face up inside the circle!",

  /* ── 부위 다섯 ── */
  "part.brow": "Brows",
  "part.liner": "Eyeliner",
  "part.shadow": "Eyeshadow",
  "part.lip": "Lips",
  "part.cheek": "Blush",
  "part.tip.brow": "Fill the sparse spots first, following the hair direction",
  "part.tip.liner": "Draw a thin line along the lash line",
  "part.tip.shadow": "Lighter in the middle of the lid, deeper at the outer corner",
  "part.tip.lip": "Start from the inside and blend out to the edges",
  "part.tip.cheek": "A round patch where your cheek lifts when you smile",
  "part.coach.brow":
    "Tidy your brows with a razor or a brow brush first — it looks much neater!",
  "part.coach.liner":
    "Fill it as close to the waterline as you can and your eyes look sharper!",
  "part.coach.shadow": "If you're using a brush, tap the excess powder off once!",
  "part.coach.lip": "Build it up in thin layers so it doesn't go too strong or patchy!",
  "part.coach.cheek": "Fade it out the way the arrow points, inside the guide!",

  /* ── 부위 가이드 화면 ── */
  "guide.parts": "Choose an area",
  "guide.mockCoach": "This is an example. Follow the dots and lines",
  "guide.wait": "Getting your guide ready…",
  "guide.notFound":
    "We couldn't find this area in your makeup preview. Follow the photo instead.",
  "guide.sub": "Take your time in front of a mirror and follow the dots and lines",
  "guide.canvasAlt": "Guide drawing for {part}",
  "guide.sample": "Example",
  "guide.live": "Open the live guide",
  "guide.family": "{name} family",
  "guide.productHead": "Products like these work",
  "guide.productNone":
    "We haven't found a product for this colour yet. Pick something close to it.",
  "guide.near": "A family close to this area's colour",
  "guide.credit": "Product photos: each brand",
  "guide.nextLast": "Next · take your finished photo",
  "guide.next": "Next — {part}",

  /* ── 화장 템플릿 화면 ── */
  "tpl.coach": "Pick the look you want to try!",
  "tpl.titleEm": "Makeup",
  "tpl.titleRest": " templates",
  "tpl.sub": "You can choose one here without uploading a photo",
  "tpl.note": "You picked {name}{eul}. Tap Apply and we'll build it for your face.",
  "tpl.apply": "Apply",

  /* ── 참고 사진 올리기 화면 ── */
  "up.readEm": "Reading the makeup colours",
  "up.readRest": " from your photo",
  "up.readSub": "Finding the face and measuring the colour used on each area",
  "up.readHead": "Reading your photo",
  "up.readBody":
    "The photo you uploaded stays on this phone. Nothing has been sent anywhere yet.",
  "up.coach": "Upload a photo of the look you want to try!",
  "up.titleEm": "Reference photo",
  "up.titleRest": " · makeup preview",
  "up.sub": "Upload a reference photo and we'll build your makeup preview",
  "up.refAlt": "The reference photo you uploaded",
  "up.change": "Choose a different photo",
  "up.pick": "Upload a reference photo",
  "up.pickHint": "A front-facing photo works best",
  "up.or": "or",
  "up.toTemplates": "Browse templates",
  "up.apply": "Apply",

  /* ── 참고 사진 읽기 실패 ── */
  "up.fail.noFace":
    "We couldn't find a face in that photo. Try a front-facing photo where the face is large.",
  "up.fail.noCanvas": "We couldn't read that photo. Please try again.",
  "up.fail.noColor":
    "The photo is too small to read the makeup colours. Try one where the face is bigger.",

  /* ── 예상 메이크업 만들기 ── */
  "make.wait": "This can take up to a minute. Please keep this screen open.",
  "make.fail.busy": "A lot of people are making previews right now. Try again in a moment.",
  "make.fail.down": "The preview server isn't answering. Try again in a moment.",
  "make.fail.off": "We can't make a preview right now. Please try again in a moment.",
  "make.fail.timeout": "It took too long and stopped. Tap again.",
  "make.fail.network": "Check your internet connection and tap again.",
  "make.fail.too_large": "That photo is too big. Try a different one.",
  "make.fail.rejected":
    "We couldn't find a face in your bare-face photo. Go back to the start and take it again.",
  "make.fail.no_bare": "There's no bare-face photo. Go back to the start and take one first.",
  "make.fail.no_attempt": "There's no finished photo.",

  /* ── 예상 메이크업 화면 ── */
  "ans.makingEm": "AI",
  "ans.makingRest": " is building your makeup preview",
  "ans.makingSub": "Checking the colours and placement in your reference photo",
  "ans.sending": "Sending your reference photo",
  "ans.making": "Building your makeup preview",
  "ans.sendingBody": "Shrinking the photo down to upload size.",
  "ans.makingBody": "Fitting the makeup from your reference photo onto your bare face.",
  "ans.failCoach": "We couldn't build the preview, but we did read the colours",
  "ans.failEm": "Makeup preview",
  "ans.failRest": " couldn't be made",
  "ans.failSub": "You can still see the per-area guides using the colours we read",
  "ans.retry": "Try again",
  "ans.skip": "Just show me the guide",
  "ans.coachMade": "Here's how it could look! Shall I walk you through it?",
  "ans.coachRead": "We read the colours from your photo. Now let's go area by area",
  "ans.doneEm": "Makeup preview",
  "ans.doneRest": " is ready",
  "ans.readEm": "Reference photo",
  "ans.readRest": " colours read",
  "ans.subMade": "Your guide is built from this photo",
  "ans.subRead": "Your guide is built from the colours we read",
  "ans.madeAlt": "Makeup preview",
  "ans.empty": "Your makeup preview will appear here",
  "ans.cardMade": "Makeup preview ready",
  "ans.cardEmpty": "Space for your makeup preview",
  "ans.readAll": "We read the colour for all five areas.",
  "ans.readSome":
    "We read the colour for {n} of the five areas. For the rest we'll guide you with a close sample colour.",
  "ans.srcCap": "We read the colours from this photo",
  "ans.noServer":
    "The preview server isn't connected yet. For now we'll guide you with the colours we read.",
  "ans.next": "Next · see the guide",

  /* ── 색 모음 화면 ── */
  "pal.coach": "It helps to have makeup in these colours before you start!",
  "pal.titleRest": " — the colours",
  "pal.sub": "Here's the colour for each area",
  "pal.head": "Colour palette from your reference photo",
  "pal.headSub": "These are the colours we read from it",
  "pal.next": "Go area by area",

  /* ── 완성사진 화면 ── */
  "att.title": "Take a photo when your makeup is done",
  "att.intro":
    "Look straight ahead with your eyes open, just like the first photo. It takes itself",
  "att.coach": "When your makeup is done, take one more from the same spot",
  "att.start": "Take a photo",
  "att.cameraTitle": "Finished photo",
  "att.loading": "Turning the camera on…",
  "att.saving": "Tidying up the photo…",
  "att.retry": "Try again",
  "att.saveFail": "We couldn't save the photo. Please take it again",
  "att.previewTitle": "Here's how it came out",
  "att.previewSub": "If it looks fine, let's move on to your feedback",
  "att.openLabel": "Photo with makeup on",
  "att.retake": "Retake",
  "att.confirm": "Get my feedback",
  "att.aim": "Line your face up inside the circle!",
  "att.back": "Back",

  /* ── 실시간 가이드 화면 ── */
  "live.loading": "Getting the camera ready…",
  "live.cameraFail": "We can't open the camera. Allow camera access in your browser settings",
  "live.noPart": "No area has been chosen",
  "live.noBaseline": "There's no bare-face photo. Please start again from the first photo",
  "live.toCapture": "Go take a photo",
  "live.button": "Check my makeup",
  "live.back": "Back",
  "live.capturing": "Taking it now — please hold still",
  "live.failed": "You moved, so we couldn't get it. Tap again",
  "live.title": "Live guide",
  "live.sample": "Example",

  /* ── 피드백 화면 ── */
  "fb.same.brow": "{color} — you filled the sparse spots and kept the hair direction",
  "fb.same.lip": "{color} — blended out nicely from the inside",
  "fb.same.cheek": "{color} — a round patch right where you smile",
  "fb.again.liner":
    "The {color} line stops short at the outer corner. Try bringing it closer to the lashes",
  "fb.again.shadow": "{color} is bunched in the middle of the lid. Blend it further out",
  "fb.tone.ok": "Close",
  "fb.tone.fix": "Worth another look",
  "fb.tone.info": "Note",
  "fb.miss.bare": "There's no bare-face photo. Please start again from the first photo",
  "fb.miss.answer":
    "There's no makeup preview yet. Go back to the upload screen and start from there",
  "fb.miss.attempt": "There's no photo with makeup on. Take your finished photo first",
  "fb.miss.answer_size":
    "The preview isn't the same size as your bare face. Please upload the reference photo again",
  "fb.miss.error":
    "Something stopped while comparing the photos. Take your finished photo again and we'll retry",
  "fb.miss.unknown": "We can't build your feedback right now",
  "fb.next": "Next · save your result",
  "fb.coach": "I'll tell you what went well and what's worth fixing!",
  "fb.title": "Feedback",
  "fb.sub": "No scores — just what matches and what to tidy up",
  "fb.waitHead": "Looking at your photo",
  "fb.waitBody": "Comparing it with your makeup preview. Just a moment.",
  "fb.cannotCoach": "There's nothing to compare yet",
  "fb.cannotSub": "A little more and we can show you",
  "fb.tplAlt": "Reference photo for the {name} look",
  "fb.tplCap": "The look you chose",
  "fb.note":
    "{why}. So the notes above are written in advance from the look you chose — they are not a comparison with your photo.",
  "fb.blockedCoach": "Take the photo again from the same spot!",
  "fb.blockedTitle": "Take it again",
  "fb.blockedSub": "The conditions are too different from your first photo to compare",
  "fb.retake": "Retake the finished photo",
  "fb.sumOk": "Close",
  "fb.sumFix": "Worth another look",
  "fb.movedFailed":
    "We couldn't measure the eyeliner this time. The warped image the server builds was late or never arrived — any line saying it couldn't be checked is not a comparison result.",
  "fb.answerCap": "Makeup preview",
  "fb.attemptCap": "My makeup",

  /* ── 저장 화면 ── */
  "save.why.bare": "There's no bare-face photo, so we can't build the card",
  "save.why.answer": "There's no makeup preview, so we can't build the card",
  "save.why.answer_size":
    "The preview isn't the same size as your bare face, so we can't build the card",
  "save.why.attempt": "There's no finished photo, so we can't build the card",
  "save.why.blocked":
    "The photo conditions were too different to give feedback. Retake your finished photo and you can save it",
  "save.why.empty": "There are no feedback lines, so we can't build the card",
  "save.why.none": "You haven't been through feedback, so we can't build the card",
  "save.why.error":
    "Something stopped while comparing the photos, so we can't build the card",
  "save.why.unknown": "We can't build the card right now",
  "save.making": "Building your card…",
  "save.coach": "Here's today's look and the products I'd suggest!",
  "save.titleEm": "Today's",
  "save.titleRest": " makeup record",
  "save.sub":
    "Your look, the colour for each area and suggested products, all on one card",
  "save.noProduct": "We haven't found a matching product yet",
  "save.ask": "Save your preview, finished photo and feedback as one image.",
  "save.do": "Save my result",
  "save.finish": "Finish",
  "save.out.shared": "Tap Save in the share sheet",
  "save.out.downloaded": "Saved to your downloads",
  "save.out.cancelled": "Saving was cancelled",
  "save.out.unavailable": "This browser can't save it. Please take a screenshot instead",
  "save.shareHint": "When the share sheet opens, tap 'Save Image'",

  /* ── 끝 · 모달 · 시작 실패 ── */
  "done.title": "All done",
  "done.body":
    "Everything on this device has been deleted. This is a test period, so the photos kept on the server are deleted at 5pm on 19 October.",
  "done.surveyAsk": "Tell us how it went and we'll use it to improve the service.",
  "done.surveyGo": "Leave feedback (1 min)",
  "done.restart": "Start again",
  "restart.title": "Start over from the beginning?",
  "restart.body":
    "Your photos and the one you uploaded will all be deleted. This can't be undone.",
  "restart.yes": "Delete and start over",
  "restart.no": "Leave it",
  "survey.title": "We'd love your feedback",
  "survey.body":
    "Tell us how it went and we'll use it to improve the service. It takes a minute.",
  "survey.go": "Leave feedback",
  "survey.later": "Maybe later",
  "boot.title": "Please open the app again",
  "boot.body": "We couldn't load the first screen. Refreshing will start it over.",
  "boot.reload": "Refresh",

  /* ── 앱 뼈대 · 길 안내 ── */
  "nav.home": "Back to the first screen",
  "nav.back.upload": "Back to taking your photo",
  "nav.back.templates": "Back to the reference photo",
  "nav.back.answer": "Back to the reference photo",
  "nav.back.palette": "Back to the makeup preview",
  "nav.back.partguide": "Back to the colour palette",
  "nav.back.feedback": "Back to your finished photo",
  "nav.back.save": "Back to the feedback",
  "app.refName": "Your photo",
  "app.refAbout": "The makeup in the photo you uploaded",
  "app.loading": "Loading the colours…",
  "app.loadFail": "We couldn't load the colours. Please tap again in a moment.",
  "app.pickOther": "Choose a different look",
  "app.retry": "Try again",

  /* ── 남은 한두 자리 ── */
  "capture.back": "Back",
  "intro.label.shading": "Contour",

  /* ── 카메라를 못 열었을 때 ── */
  "cam.fail.denied":
    "Camera access is off. Allow the camera in your browser settings and try again",
  "cam.fail.busy": "The camera didn't start. Close any other app using it and try again",
  "cam.fail.none":
    "We couldn't find a camera. Please open this on a phone or computer that has one",
  "cam.fail.other": "We can't open the camera. Please try again in a moment",

  /* ── 촬영 안내 — 코어가 주는 글 ── */
  "shot.cut": "I can't see you well — move into the circle!",
  "shot.occluded": "Please don't cover your face",
  "shot.bangs": "Sweep your fringe aside so your forehead shows",
  "shot.front": "Turn your head just a little!",
  "shot.open": "Please open your eyes",
  "shot.near": "A little closer",
  "shot.far": "A little further back",
  "shot.sharp": "It's blurry. Hold still for a moment",
  "shot.bright_low": "Move somewhere a bit brighter",
  "shot.bright_high": "Too bright. Move somewhere a bit darker",
  "shot.color": "The light colour changed. Please shoot from your first spot",
  "shot.ready": "Hold it — Stop!",
  "shot.step.front_open": "Look straight ahead with your eyes open",
  "shot.slowHint": "Check that your hair or hand isn't covering your face",

  /* ── 화장 템플릿 열 가지 — 코어 templates.ts ── */
  "tpl.name.01": "Grown-up",
  "tpl.name.02": "Semi smoky",
  "tpl.name.03": "Autumn",
  "tpl.name.04": "Fresh-faced",
  "tpl.name.05": "Idol",
  "tpl.name.06": "Soft cool",
  "tpl.name.07": "Lovely",
  "tpl.name.08": "Daily",
  "tpl.name.09": "Highteen",
  "tpl.name.10": "Nude",
  "tpl.about.01": "Defined eyes with a calm lip",
  "tpl.about.02": "Soft shading wrapped around the eyes",
  "tpl.about.03": "Warm shades with a red undertone",
  "tpl.about.04": "Light, letting your skin show through",
  "tpl.about.05": "Sparkling eyes and a defined lip",
  "tpl.about.06": "Cool eyes and clear skin",
  "tpl.about.07": "Pink cheeks and a dewy lip",
  "tpl.about.08": "A light look for every day",
  "tpl.about.09": "Fresh cheeks and a glossy lip",
  "tpl.about.10": "Barely any colour — a bare-face feel",

  /* ── 테스트 종료 화면 — 코어 test-period.ts ── */
  "closed.title": "The test period has ended",
  "closed.body":
    "The nudy test ended at 3pm on 19 October. Thank you for trying it. Everything left on this device has just been deleted, and the photos and usage records kept on the server are all deleted at 5pm on 19 October.",
  "closed.survey": "Leave feedback (1 min)",

  /* ── 찍은 장 이름 — 코어 flow.ts SHOTS ── */
  "shot.name.front_open": "Facing forward · eyes open",


  /*
   * 색 이름 — 바탕 41개 + 꾸밈말 4개 (코어 `color-name.ts` · `color-family.ts`).
   * 화면에는 「뮤트 로즈브라운」처럼 꾸밈말 + 바탕으로 붙여 나온다.
   * **보여 주는 글만** 이것이고, 제품을 찾을 때 쓰는 값은 코어의 한글 이름 그대로다
   * (`lib/core-text.ts` 의 `colorText` 머리글 — 바꾸면 추천이 0개가 된다).
   */
  "hue.gold": "Gold",
  "hue.grey": "Grey",
  "hue.greige": "Greige",
  "hue.greyBrown": "Grey brown",
  "hue.navy": "Navy",
  "hue.nudeBeige": "Nude beige",
  "hue.nudePink": "Nude pink",
  "hue.darkBrown": "Dark brown",
  "hue.deepRed": "Deep red",
  "hue.deepBrown": "Deep brown",
  "hue.lavender": "Lavender",
  "hue.lightBrown": "Light brown",
  "hue.red": "Red",
  "hue.redBrown": "Red brown",
  "hue.rose": "Rose",
  "hue.roseBrown": "Rose brown",
  "hue.mauve": "Mauve",
  "hue.milkBrown": "Milk brown",
  "hue.burgundy": "Burgundy",
  "hue.beige": "Beige",
  "hue.beigePink": "Beige pink",
  "hue.brown": "Brown",
  "hue.brick": "Brick",
  "hue.black": "Black",
  "hue.apricot": "Apricot",
  "hue.softBlack": "Soft black",
  "hue.ashBrown": "Ash brown",
  "hue.orange": "Orange",
  "hue.olive": "Olive",
  "hue.charcoal": "Charcoal",
  "hue.cherry": "Cherry",
  "hue.chocoBrown": "Chocolate brown",
  "hue.khaki": "Khaki",
  "hue.khakiBrown": "Khaki brown",
  "hue.coral": "Coral",
  "hue.taupe": "Taupe",
  "hue.purple": "Purple",
  "hue.plum": "Plum",
  "hue.peach": "Peach",
  "hue.pink": "Pink",
  "hue.mlbb": "MLBB",

  /* 꾸밈말 — 바탕 이름 앞에 붙는다 */
  "tone.muted": "Muted",
  "tone.deep": "Deep",
  "tone.light": "Light",
  "tone.vivid": "Vivid",
} as const;
