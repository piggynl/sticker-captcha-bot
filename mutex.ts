import "source-map-support/register";

class Mutex {

    private avail: boolean;

    private resolvers: (() => void)[];

    public constructor() {
        this.avail = true;
        this.resolvers = [];
    }

    public test(): boolean {
        return this.avail;
    }

    public async lock(): Promise<void> {
        if (this.avail) {
            this.avail = false;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.resolvers.push(resolve);
        });
    }

    public unlock(): void {
        const resolve = this.resolvers.shift();
        if (resolve === undefined) {
            this.avail = true;
            return;
        }
        resolve();
    }

}

export = Mutex;
