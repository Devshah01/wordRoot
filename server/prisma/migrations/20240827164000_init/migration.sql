-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "expo_push_token" TEXT,
    "notification_time" TEXT NOT NULL DEFAULT '09:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "date_added" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fsrs_stability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "fsrs_difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "fsrs_lapses" INTEGER NOT NULL DEFAULT 0,
    "fsrs_reps" INTEGER NOT NULL DEFAULT 0,
    "fsrs_state" TEXT NOT NULL DEFAULT 'New',
    "last_review" TIMESTAMP(3),
    "next_review" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "words_user_id_word_key" ON "words"("user_id", "word");

-- AddForeignKey
ALTER TABLE "words" ADD CONSTRAINT "words_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

