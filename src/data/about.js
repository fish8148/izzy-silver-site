/**
 * About Me page content (the "Editorial" design, 14a; the 3D character stands beside the intro). Edit freely.
 *
 *   intro       one entry per paragraph, set large at the top
 *   resume      where both "resume ↗" links go (opens in a new tab). For a file, put it in public/ (e.g. public/resume.pdf).
 *   highlights  one section each, in order: its name stays pinned on the left while its photos scroll past on the right.
 *     description  a paragraph ('' shows nothing)
 *     photos       { src, alt } each, `src` a path in /public; leave off the extension for a photo made by
 *                  `npm run prep:photos`. The grid goes wide, half, half, wide, and repeats.
 */
export const about = {
  intro: [
    'hi, my name is izzy silver. I’m a computer engineering student at university of waterloo.',
    'I grew up with a passion for technology, design, and personal health.',
    'for my last co-op, I worked as an architectural visualization researcher for studio lab XR.',
  ],
  resume: 'resume.pdf',
  highlights: [
    {
      slug: 'studio-lab-xr',
      name: 'studio lab XR',
      role: 'architectural visualization researcher',
      description:
        'As an Architectural Visualisation Researcher at Studio Lab XR, I worked with Assistant Professor Jason Shields of the University of Manitoba to turn a LiDAR scan of The Wall by Bruce Head, Canada’s largest concrete relief, into an interactive VR experience in Unreal Engine 5. I processed the point cloud in Leica Cyclone 3DR (cleaning, scan-to-mesh conversion, smoothing and hole-filling) and exported optimized meshes for real-time rendering. In Unreal I built the interactive layer in Blueprints and UMG: a VR menu for lighting and media controls, dynamic information panels with matching lighting, and grab interactions. I also researched and educated local students and companies on how to bring Revit/BIM models into Unreal through Datasmith and Dataprep, and wrote the project documentation so the team and local architecture firms could reuse the workflow.',
      photos: [
        { src: 'photos/studio-lab-xr-the-wall', alt: 'The Wall by Bruce Head, a long curved concrete relief lit from above, with people walking past' },
        { src: 'photos/studio-lab-xr-booth', alt: 'Izzy with the New Media Manitoba team at their booth, beside a screen showing a 3D scan' },
      ],
    },
    {
      slug: 'qdoc',
      name: 'qdoc inc.',
      role: 'website developer',
      description:
        'At QDoc, a Winnipeg healthcare technology company, I was the website developer for three years, building and maintaining the marketing site that introduced patients and partners to the company’s app. I helped raise awareness and usage of the application, and I helped shape QDoc’s brand identity, including the typography and colour palette the company still uses today. I also helped oversee co-op students from Red River College Polytech’s Web Development program, which gave me early experience reviewing other people’s work and supporting teammates who were newer to the codebase.',
      photos: [
        { src: 'photos/qdoc-human-rights-museum', alt: 'The Canadian Museum for Human Rights in Winnipeg at night, its glass shell and tower lit up' },
        { src: 'photos/qdoc-jets-game', alt: 'The Winnipeg Jets mascots waving flags on the ice in front of a crowd in white' },
      ],
    },
    {
      slug: 'uwaterloo',
      name: 'university of waterloo',
      role: 'student',
      description:
        'I’m a Computer Engineering student at the University of Waterloo, and I’m grateful to study somewhere that pushes me as hard as it does. After starting in Architectural Engineering and transferring into Computer Engineering, I’ve learned to work independently, push through difficult stretches, and trust my own skills. Outside of class I climb, lift and have recently picked up snowboarding, which has taught me to keep trying things I’m not good at yet. I’ve also taken on leadership roles in the Engineering Society, where I’ve been elected to several positions, most recently as CFO and Academic Rep.',
      photos: [
        { src: 'photos/uwaterloo-campus', alt: 'A University of Waterloo building at dusk, its windows lit' },
        { src: 'photos/uwaterloo-snowboarding', alt: 'Izzy and friends in snowboarding gear outside a Tim Hortons at night, holding one friend sideways' },
      ],
    },
  ],
};
