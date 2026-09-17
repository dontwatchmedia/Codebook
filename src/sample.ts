import { makeBook, makeChapter, uid, type Book } from "./model";
const text = (s: string) => ({ type: "text", text: s });
const p = (s: string) => ({ type: "paragraph", content: [text(s)] });
export function sampleBook(): Book {
  const b = makeBook("Learning C++", "technical");
  const part = b.nodes.find((n) => n.type === "part")!;
  const first = makeChapter("Hello, World!", part.id);
  first.tags = "beginner, foundations";
  first.notes =
    "Keep this chapter welcoming. Every great programmer started with a small first step.";
  first.document = {
    type: "doc",
    content: [
      p(
        "Every program begins with an idea. In this chapter, we’ll turn a small one into something real: a program that introduces itself to the world.",
      ),
      {
        type: "heading",
        attrs: { level: 2 },
        content: [text("A small beginning")],
      },
      p(
        "You don’t need to understand every symbol just yet. Read through the example below and notice the shape of the program.",
      ),
      {
        type: "codeBlock",
        attrs: {
          language: "cpp",
          filename: "hello.cpp",
          showLineNumbers: true,
          caption: "Our first C++ program",
        },
        content: [
          text(
            '#include <iostream>\n\nint main()\n{\n    std::cout << "Hello, World!\\n";\n    return 0;\n}',
          ),
        ],
      },
      {
        type: "paragraph",
        content: [
          text("The "),
          { ...text("std::cout"), marks: [{ type: "code" }] },
          text(
            " object writes text to standard output. Here, it gives our program a voice — just one line, but a beginning nonetheless.",
          ),
        ],
      },
      {
        type: "callout",
        attrs: { kind: "tip" },
        content: [
          p(
            "Try making it yours. Replace “Hello, World!” with your own message, then run the program again.",
          ),
        ],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [text("What just happened?")],
      },
      {
        type: "orderedList",
        content: [
          "We included the standard input/output library.",
          "We created main(), where our program begins.",
          "We printed a message and returned successfully.",
        ].map((s) => ({ type: "listItem", content: [p(s)] })),
      },
      p(
        "Small experiments build understanding. In the next chapter, we’ll give our programs something to remember.",
      ),
    ],
  };
  const second = makeChapter("Variables & types", part.id);
  second.status = "Outline";
  second.document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [text("Giving ideas a name")],
      },
      p(
        "Variables let a program remember values. A name makes that value meaningful.",
      ),
      {
        type: "codeBlock",
        attrs: { language: "cpp", filename: "variables.cpp" },
        content: [
          text(
            'int chapters = 12;\ndouble progress = 0.25;\nstd::string title = "A new beginning";',
          ),
        ],
      },
    ],
  };
  const third = makeChapter("Making decisions", part.id);
  third.status = "Idea";
  const p2 = {
    type: "part" as const,
    id: uid(),
    title: "Thinking in programs",
  };
  const c4 = makeChapter("Functions", p2.id);
  c4.status = "Idea";
  const c5 = makeChapter("Putting it together", p2.id);
  c5.status = "Idea";
  const preface = {
    ...makeChapter("A note to the reader"),
    kind: "front" as const,
    status: "Final" as const,
    document: {
      type: "doc",
      content: [
        p(
          "This book is an invitation to be curious. We’ll learn C++ one small experiment at a time, with plenty of room to ask questions and make mistakes.",
        ),
        p(
          "This is a sample manuscript. Explore, edit, or create a book of your own from the library.",
        ),
      ],
    },
  };
  return {
    ...b,
    subtitle: "Small steps. Real understanding.",
    author: "The CodeBook team",
    description:
      "An approachable introduction to programming, one small experiment at a time.",
    nodes: [
      preface,
      part,
      first,
      second,
      third,
      p2,
      c4,
      c5,
      { ...makeChapter("Further reading"), kind: "back" },
    ],
  };
}
